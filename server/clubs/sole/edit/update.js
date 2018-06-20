// Update club title and description
//

'use strict';


const charcount   = require('charcount');
const crypto      = require('crypto');
const mime        = require('mime-types');
const fs          = require('mz/fs');
const sharp       = require('sharp');
const resizeParse = require('nodeca.users/server/_lib/resize_parse');
const resize      = require('nodeca.users/models/users/_lib/resize');

// If same user edits the same club within 5 minutes, all changes
// made within that period will be squashed into one diff.
const HISTORY_GRACE_PERIOD = 5 * 60 * 1000;


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_id:         { format: 'mongo', required: true },
    title:           { type: 'string',  required: true },
    description:     { type: 'string',  required: true },
    membership:      { 'enum': [ 'open', 'closed' ], required: true },
    remove_avatar:   { type: 'boolean' },
    remove_location: { type: 'boolean' },
    avatar:          { type: 'string' }
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

    env.data.is_club_member = !!membership;
    env.data.is_club_owner  = !!membership && membership.is_owner;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let settings = await env.extras.settings.fetch([
      'clubs_lead_can_edit_clubs',
      'clubs_mod_can_edit_clubs'
    ]);

    if (settings.clubs_mod_can_edit_clubs) return;
    if (env.data.is_club_owner && settings.clubs_lead_can_edit_clubs) return;

    throw N.io.FORBIDDEN;
  });


  // Check title length
  //
  N.wire.before(apiPath, async function check_title_length(env) {
    let max_length = await env.extras.settings.fetch('clubs_club_title_max_length');
    let title_length = charcount(env.params.title.trim());

    if (title_length === 0) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_title_empty')
      };
    }

    if (title_length > max_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_title_too_long', max_length)
      };
    }
  });


  // Save new avatar if it's uploaded
  //
  N.wire.before(apiPath, async function save_avatar(env) {
    let fileInfo = env.req.files.avatar && env.req.files.avatar[0];
    if (!fileInfo) return;

    let config = resizeParse(N.config.users.avatars);
    let contentType = env.req.files.avatar[0].headers['content-type'];
    let ext = mime.extensions[contentType] && mime.extensions[contentType][0];
    let typeConfig = config.types[ext];

    if (!typeConfig) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_unsupported_image')
      };
    }

    let tmpfile = '/tmp/club-avatar-' + crypto.pseudoRandomBytes(8).toString('hex') + '.' + ext;

    let sharpInstance = sharp(fileInfo.path);

    sharpInstance.rotate()
                 .resize(config.resize.orig.width, config.resize.orig.height)
                 .crop(sharp.strategy.center);

    try {
      await sharpInstance.toFile(tmpfile);
    } catch (__) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_bad_image')
      };
    }

    try {
      let data = await resize(tmpfile, {
        store: N.models.core.File,
        ext,
        maxSize: typeConfig.max_size,
        resize: typeConfig.resize
      });

      env.data.remove_old_avatar = env.data.club.avatar_id;
      env.data.new_avatar = data.id;
    } finally {
      await fs.unlink(tmpfile);
    }
  });


  // Set old avatar for removing if flag is set
  //
  N.wire.before(apiPath, function remove_avatar(env) {
    if (env.params.remove_avatar) {
      env.data.remove_old_avatar = env.data.club.avatar_id;
    }
  });


  // Update club info
  //
  N.wire.on(apiPath, async function update_club(env) {
    let update_data = {
      $set: {
        title: env.params.title,
        description: env.params.description,
        is_closed: env.params.membership === 'closed'
      }
    };

    if (env.data.new_avatar) {
      update_data.$set.avatar_id = env.data.new_avatar;
    } else if (env.data.remove_old_avatar) {
      update_data.$unset = { avatar_id: true };
    }

    if (env.params.remove_location) {
      update_data.$unset = { location: true };
    }

    let update_result = await N.models.clubs.Club.update({ _id: env.data.club._id }, update_data);

    env.data.is_updated = update_result.nModified > 0;
  });


  // Save old version in club history
  //
  N.wire.after(apiPath, async function save_history(env) {
    if (!env.data.is_updated) return;

    let new_club = await N.models.clubs.Club.findById(env.data.club._id)
                             .lean(true);

    let last_entry = await N.models.clubs.ClubHistory.findOne({
      club: env.data.club._id
    }).sort('-_id').lean(true);

    let last_update_time = last_entry ? last_entry.ts   : new Date(0);
    let last_update_user = last_entry ? last_entry.user : null;
    let now = new Date();

    // if the same user edits the same club within grace period, history won't be changed
    if (!(last_update_time > now - HISTORY_GRACE_PERIOD &&
          last_update_time < now &&
          String(last_update_user) === String(env.user_info.user_id))) {

      /* eslint-disable no-undefined */
      last_entry = await new N.models.clubs.ClubHistory({
        club:        env.data.club._id,
        user:        env.user_info.user_id,
        title:       env.data.club.title,
        description: env.data.club.description,
        is_closed:   env.data.club.is_closed,
        avatar_id:   env.data.club.avatar_id,
        location:    env.data.club.location
      }).save();
    }

    // if the next history entry would be the same as the last one
    // (e.g. user saves post without changes or reverts change within 5 min),
    // remove redundant history entry
    if (last_entry) {
      let last_club_str = JSON.stringify({
        club:        last_entry.club,
        user:        last_entry.user,
        title:       last_entry.title,
        description: last_entry.description,
        is_closed:   last_entry.is_closed,
        avatar_id:   last_entry.avatar_id,
        location:    last_entry.location
      });

      let next_club_str = JSON.stringify({
        club:        new_club._id,
        user:        env.user_info.user_id,
        title:       new_club.title,
        description: new_club.description,
        is_closed:   new_club.is_closed,
        avatar_id:   new_club.avatar_id,
        location:    new_club.location
      });

      if (last_club_str === next_club_str) {
        await N.models.clubs.ClubHistory.remove({ _id: last_entry._id });
      }
    }

    await N.models.clubs.Club.update(
      { _id: env.data.club._id },
      { $set: {
        last_edit_ts: new Date(),
        edit_count: await N.models.clubs.ClubHistory.count({ club: env.data.club._id })
      } }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.club_sole_search_update_by_ids([ env.data.club._id ]).postpone();
  });


  // Remove old avatar
  //
  N.wire.after(apiPath, async function remove_old_avatar(env) {
    if (!env.data.remove_old_avatar) return;

    await N.models.core.File.remove(env.data.remove_old_avatar, true);
  });


  // Mark user as active
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    await N.wire.emit('internal:users.mark_user_active', env);
  });
};
