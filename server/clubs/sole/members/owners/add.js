// Assign ownership status to another user
//

'use strict';

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
    let settings = await env.extras.settings.fetch([
      'clubs_lead_can_edit_club_owners',
      'clubs_mod_can_edit_club_owners'
    ]);

    if (env.data.is_club_owner && settings.clubs_lead_can_edit_club_owners) return;
    if (settings.clubs_mod_can_edit_club_owners) return;

    throw N.io.NOT_FOUND;
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


  // Check if target user is ignoring the sender
  // to avoid giving club owners the opportunity to spam people
  //
  N.wire.before(apiPath, async function check_ignore(env) {
    let ignore_data = await N.models.users.Ignore.findOne()
                                .where('from').equals(env.data.user._id)
                                .where('to').equals(env.user_info.user_id)
                                .lean(true);

    if (ignore_data) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_sender_is_ignored')
      };
    }
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


  // Notify user via email
  //
  N.wire.after(apiPath, async function notify_user(env) {
    // duplicate request, nothing to do
    if (!env.data.secret_key) return;

    let to = await userInfo(N, env.data.user._id);
    let locale = to.locale || N.config.locales[0];

    let general_project_name = await N.settings.get('general_project_name');

    let subject = N.i18n.t(locale, 'clubs.sole.members.owners.add.email_subject', {
      project_name: general_project_name
    });

    let text = N.i18n.t(locale, 'clubs.sole.members.owners.add.email_text', {
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

    await N.mailer.send({
      to: env.data.user.email,
      subject,
      text,
      safe_error: true
    });
  });
};
