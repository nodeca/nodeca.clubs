// Show club edit form
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


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    if (!env.data.is_club_owner) throw N.io.FORBIDDEN;
  });


  // Fill response
  //
  N.wire.on(apiPath, async function fill_response(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');

    env.res.club = await sanitize_club(N, env.data.club, env.user_info);
    env.res.title_max_length = await env.extras.settings.fetch('clubs_club_title_max_length');
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
