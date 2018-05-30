// Assign ownership status to another user
//

'use strict';

const _           = require('lodash');
const ObjectId    = require('mongoose').Types.ObjectId;
const createToken = require('nodeca.core/lib/app/random_token');
const userInfo    = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    nick:    { type: 'string', required: true },
    club_id: { format: 'mongo', required: true }
  });


  // Fetch club info and membership
  //
  N.wire.before(apiPath, async function fetch_club_info(env) {
    let club = await N.models.clubs.Club.findById(env.params.club_id)
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;

    let membership = await N.models.clubs.Membership.findOne()
                               .where('user').equals(env.user_info.user_id)
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    env.res.is_club_member = env.data.is_club_member = !!membership;
    env.res.is_club_owner  = env.data.is_club_owner  = !!membership && membership.is_owner;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    if (!env.data.is_club_owner) throw N.io.NOT_FOUND;
  });


  // Fetch user by nick
  //
  N.wire.before(apiPath, async function fetch_user(env) {
    env.data.user = await N.models.users.User.findOne()
                              .where('nick').equals(env.params.nick)
                              .where('exists').equals(true)
                              .lean(true);

    if (!env.data.user) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_user_not_found')
      };
    }
  });


  // Get club membership for that user
  //
  N.wire.before(apiPath, async function check_target_user_membership(env) {
    env.data.target_membership = await N.models.clubs.Membership.findOne()
                                           .where('user').equals(env.data.user._id)
                                           .where('club').equals(env.data.club._id)
                                           .lean(true);
  });


  // Send ownership request for that user
  //
  N.wire.on(apiPath, async function add_ownership_request(env) {
    // already an owner, nothing to do here
    if (env.data.target_membership && env.data.target_membership.is_owner) return;

    let secret_key = createToken();

    // user may already have a request, so use upsert to avoid duplicates
    let result = await N.models.clubs.OwnershipPending.update(
      { club: env.data.club._id, user: env.data.user._id },
      { $setOnInsert: { from: env.user_info.user_id, ts: new Date(), secret_key } },
      { upsert: true }
    );

    if (result.upserted) {
      // only if new ownership request was created
      env.data.secret_key = secret_key;
    }
  });


  // Notify user via PM (via dialogs)
  //
  N.wire.after(apiPath, async function notify_user(env) {
    // duplicate request, nothing to do
    if (!env.data.secret_key) return;

    let to = await userInfo(N, env.data.user._id);
    let locale = to.locale || N.config.locales[0];

    // Fetch user to send messages from
    //
    let bot = await N.models.users.User.findOne()
                        .where('hid').equals(N.config.bots.default_bot_hid)
                        .lean(true);

    // Render message text
    //
    let text = N.i18n.t(locale, 'clubs.sole.members.owners.add.text', {
      user_name: env.user_info.user_name,
      user_link: N.router.linkTo('users.member', {
        user_hid: env.user_info.user_hid
      }),
      club_title: env.data.club.title,
      club_link: N.router.linkTo('clubs.sole', {
        club_hid: env.data.club.hid
      }),
      confirm_link: N.router.linkTo('clubs.sole.members.owners.confirm', {
        club_hid: env.data.club.hid,
        secret_key: env.data.secret_key
      })
    });

    let options = {
      link: true
    };

    let parse_result = await N.parser.md2html({
      text,
      attachments: [],
      options,
      user_info: to
    });

    let preview_data = await N.parser.md2preview({
      text,
      limit: 500,
      link2text: true
    });


    // Prepare message and dialog data
    //
    let message_data = {
      common_id:    new ObjectId(),
      ts:           Date.now(),
      user:         bot._id,
      html:         parse_result.html,
      md:           text,
      attach:       [],
      params:       options,
      imports:      parse_result.imports,
      import_users: parse_result.import_users,
      tail:         parse_result.tail
    };

    let dlg_update_data = {
      exists: true, // force dialog to re-appear if it was deleted
      cache: {
        last_user: message_data.user,
        last_ts: message_data.ts,
        preview: preview_data.preview
      }
    };

    // Find opponent's dialog, create if doesn't exist
    //
    let opponent_dialog = await N.models.users.Dialog.findOne({
      user: env.data.user._id,
      to:   bot._id
    });

    if (!opponent_dialog) {
      opponent_dialog = new N.models.users.Dialog({
        user: env.data.user._id,
        to:   bot._id
      });
    }

    _.merge(opponent_dialog, dlg_update_data);

    let opponent_msg = new N.models.users.DlgMessage(_.assign({
      parent: opponent_dialog._id
    }, message_data));

    opponent_dialog.unread = (opponent_dialog.unread || 0) + 1;
    opponent_dialog.cache.last_message = opponent_msg._id;
    opponent_dialog.cache.is_reply     = String(opponent_msg.user) === String(message_data.user);


    // Save dialogs and messages
    //
    await Promise.all([
      opponent_dialog.save(),
      opponent_msg.save()
    ]);


    // Notify user
    //
    let dialogs_notify = await N.settings.get('dialogs_notify', { user_id: opponent_dialog.user });

    if (dialogs_notify) {
      await N.wire.emit('internal:users.notify', {
        src:  opponent_dialog._id,
        to:   opponent_dialog.user,
        type: 'USERS_MESSAGE'
      });
    }
  });
};
