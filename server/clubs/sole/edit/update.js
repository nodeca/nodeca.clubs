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


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_id:       { format: 'mongo', required: true },
    title:         { type: 'string',  required: true },
    description:   { type: 'string',  required: true },
    remove_avatar: { type: 'boolean' },
    avatar:        { type: 'string' }
  });


  // Fetch club info and membership
  //
  N.wire.before(apiPath, async function fetch_club_info(env) {
    let club = await N.models.clubs.Club.findById(env.params.club_id)
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;

    let membership = await N.models.clubs.ClubMember.findOne()
                               .where('user').equals(env.user_info.user_id)
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    env.data.is_club_member = !!membership;
    env.data.is_club_owner  = !!membership && membership.is_owner;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    if (!env.data.is_club_owner) throw N.io.FORBIDDEN;
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
  N.wire.on(apiPath, function update_club(env) {
    let update_data = {
      $set: {
        title: env.params.title,
        description: env.params.description
      }
    };

    if (env.data.new_avatar) {
      update_data.$set.avatar_id = env.data.new_avatar;
    } else if (env.data.remove_old_avatar) {
      update_data.$unset = { avatar_id: true };
    }

    return N.models.clubs.Club.update({ _id: env.data.club._id }, update_data);
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
