// Create a club
//

'use strict';


const charcount = require('charcount');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    title: { type: 'string', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let clubs_can_create_club = await env.extras.settings.fetch('clubs_can_create_clubs');

    if (!clubs_can_create_club) throw N.io.FORBIDDEN;
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


  // Create a new club
  //
  N.wire.on(apiPath, async function create_club(env) {
    let club = await N.models.clubs.Club.create({
      title: env.params.title
    });

    await N.models.clubs.ClubMember.create({
      club: club._id,
      user: env.user_info.user_id,
      is_owner: true
    });

    await N.models.clubs.Club.updateMembers(club._id);
    await N.models.clubs.Club.updateCache(club._id);

    env.data.club = club;
  });


  // Fill url of the new club
  //
  N.wire.after(apiPath, function fill_url(env) {
    env.res.redirect_url = N.router.linkTo('clubs.sole', {
      club_hid: env.data.club.hid
    });
  });


  // Mark user as active
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    await N.wire.emit('internal:users.mark_user_active', env);
  });
};
