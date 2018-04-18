// Show the list of club members
//

'use strict';


const _             = require('lodash');
const sanitize_club = require('nodeca.clubs/lib/sanitizers/club');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid: { type: 'integer', required: true }
  });


  // Redirect guests to login page
  //
  N.wire.before(apiPath, function force_login_guest(env) {
    return N.wire.emit('internal:users.force_login_guest', env);
  });


  // Fetch club
  //
  N.wire.before(apiPath, async function fetch_club(env) {
    env.data.club = await N.models.clubs.Club.findOne()
                              .where('hid').equals(env.params.club_hid)
                              .lean(true);

    if (!env.data.club) throw N.io.NOT_FOUND;
  });


  // Fetch club members
  //
  N.wire.on(apiPath, async function fetch_club_members(env) {
    env.res.club = await sanitize_club(N, env.data.club, env.user_info);

    let can_see_hellbanned = await env.extras.settings.fetch('can_see_hellbanned');

    let query = N.models.clubs.ClubMember.find().where('club').equals(env.data.club._id);

    if (!(can_see_hellbanned || env.user_info.hb)) {
      query = query.where('hb').ne(true);
    }

    let membership = await query.lean(true);

    env.res.club_member_ids = _.map(membership, 'user');
    env.res.club_admin_ids  = _.map(membership.filter(user => user.is_owner), 'user');

    env.data.users = (env.data.users || []).concat(env.res.club_member_ids);
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');
    env.res.head.robots = 'noindex,follow';
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_topic_breadcrumbs(env) {
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

    env.res.breadcrumbs = env.data.breadcrumbs;
  });
};
