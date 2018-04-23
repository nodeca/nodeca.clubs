// Main clubs page (list of clubs user have joined)
//

'use strict';


const _             = require('lodash');
const sanitize_club = require('nodeca.clubs/lib/sanitizers/club');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  // Fetch list of clubs user has joined
  //
  N.wire.on(apiPath, async function my_clubs_fetch(env) {
    let membership = [], clubs = [];

    if (env.user_info.is_member) {
      membership = await N.models.clubs.ClubMember.find()
                             .where('user').equals(env.user_info.user_id)
                             .lean(true);
    }

    if (membership.length > 0) {
      let can_see_hellbanned = await env.extras.settings.fetch('can_see_hellbanned');

      clubs = await N.models.clubs.Club.find()
                        .where('_id').in(_.map(membership, 'club'))
                        .sort(env.user_info.hb || can_see_hellbanned ? '-cache_hb.last_ts' : '-cache.last_ts')
                        .lean(true);
    }

    env.res.clubs = await sanitize_club(N, clubs, env.user_info);
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');
  });


  // Fill breadcrumbs
  //
  N.wire.after(apiPath, function fill_breadcrumbs(env) {
    env.data.breadcrumbs = [];

    env.data.breadcrumbs.push({
      text: env.t('@common.menus.navbar.clubs'),
      route: 'clubs.index'
    });

    env.res.breadcrumbs = env.data.breadcrumbs;
  });


  // Fetch and fill permissions
  //
  N.wire.before(apiPath, async function fetch_and_fill_permissions(env) {
    env.res.settings = await env.extras.settings.fetch([
      'clubs_can_create_clubs',
      'clubs_club_title_max_length'
    ]);
  });
};
