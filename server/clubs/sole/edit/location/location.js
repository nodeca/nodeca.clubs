// Form for user club location
//
'use strict';


const sanitize_club = require('nodeca.clubs/lib/sanitizers/club');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid: { type: 'integer', required: true }
  });


  // Fetch club info and membership
  //
  N.wire.before(apiPath, async function fetch_club_info(env) {
    let club = await N.models.clubs.Club.findOne()
                         .where('hid').equals(env.params.club_hid)
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


  // Check if user has an access to this club
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { clubs: env.data.club, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.club', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
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


  // Fill response
  //
  N.wire.on(apiPath, async function fill_response(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');

    env.res.club = await sanitize_club(N, env.data.club, env.user_info);
  });


  // Fill breadcrumbs
  //
  N.wire.after(apiPath, async function fill_breadcrumbs(env) {
    env.data.breadcrumbs = [];

    env.data.breadcrumbs.push({
      text: env.t('@common.menus.navbar.clubs'),
      route: 'clubs.index'
    });

    env.data.breadcrumbs.push({
      text: env.data.club.title,
      route: 'clubs.sole',
      params: { club_hid: env.data.club.hid }
    });

    env.data.breadcrumbs.push({
      text: env.t('breadcrumbs_title')
    });

    env.res.breadcrumbs = env.data.breadcrumbs;
  });
};
