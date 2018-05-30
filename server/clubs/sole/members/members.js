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

    env.res.is_club_member = env.data.is_club_member = !!membership;
    env.res.is_club_owner  = env.data.is_club_owner  = !!membership && membership.is_owner;
  });


  // Fetch number of members, leaders, pending and blocked users;
  // needed to display this information on tabs
  //
  N.wire.before(apiPath, async function fetch_stats(env) {
    if (!env.data.is_club_owner) return;

    let [ members, owners, blocked, pending_members, pending_owners ] = await Promise.all([
      N.models.clubs.Membership.count({ club: env.data.club._id }),
      N.models.clubs.Membership.count({ club: env.data.club._id, is_owner: true }),
      N.models.clubs.Blocked.count({ club: env.data.club._id }),
      env.data.club.is_closed ?
        N.models.clubs.MembershipPending.count({ club: env.data.club._id }) :
        Promise.resolve(0),
      N.models.clubs.OwnershipPending.count({ club: env.data.club._id })
    ]);

    env.res.stats = {
      members,
      owners,
      blocked,
      pending_members,
      pending_owners
    };
  });


  // Fetch club members
  //
  N.wire.on(apiPath, async function fetch_club_members(env) {
    env.res.club = await sanitize_club(N, env.data.club, env.user_info);

    let membership = await N.models.clubs.Membership.find()
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    env.res.club_member_ids = _.map(membership, 'user');
    env.res.club_owner_ids  = _.map(membership.filter(user => user.is_owner), 'user');

    env.data.users = (env.data.users || []).concat(env.res.club_member_ids);
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('@clubs.sole.members.title');
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