// Show audit log
//

'use strict';


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


  // Fetch permissions
  //
  N.wire.before(apiPath, async function fetch_permissions(env) {
    env.res.settings = env.data.settings = await env.extras.settings.fetch([
      'clubs_lead_can_edit_club_members',
      'clubs_lead_can_edit_club_owners',
      'clubs_mod_can_edit_club_members',
      'clubs_mod_can_edit_club_owners'
    ]);
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


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    // allow seeing all pages to:
    //  - club owners (regardless of permissions)
    //  - global administrators (who can edit members or owners)
    let can_manage_users = env.data.settings.clubs_mod_can_edit_club_members ||
                           env.data.settings.clubs_mod_can_edit_club_owners ||
                           env.data.is_club_owner;
    // allow seeing log to:
    //  - global administrators (who can edit members or owners)
    let can_see_log = env.data.settings.clubs_mod_can_edit_club_members ||
                      env.data.settings.clubs_mod_can_edit_club_owners;

    env.res.can_manage_users = env.data.can_manage_users = can_manage_users;
    env.res.can_see_log = env.data.can_see_log = can_see_log;

    if (!can_see_log) throw N.io.NOT_FOUND;
  });


  // Fetch number of members, leaders, pending and blocked users;
  // needed to display this information on tabs
  //
  N.wire.before(apiPath, async function fetch_stats(env) {
    if (!env.data.can_manage_users) return;

    let [
      members,
      owners,
      blocked,
      pending_members,
      pending_owners,
      log_records
    ] = await Promise.all([
      N.models.clubs.Membership.count({ club: env.data.club._id }),
      N.models.clubs.Membership.count({ club: env.data.club._id, is_owner: true }),
      N.models.clubs.Blocked.count({ club: env.data.club._id }),
      env.data.club.is_closed ?
        N.models.clubs.MembershipPending.count({ club: env.data.club._id }) :
        Promise.resolve(),
      N.models.clubs.OwnershipPending.count({ club: env.data.club._id }),
      env.data.can_see_log ?
        N.models.clubs.ClubAuditLog.count({ club: env.data.club._id }) :
        Promise.resolve()
    ]);

    env.res.stats = {
      members,
      owners,
      blocked,
      pending_members,
      pending_owners,
      log_records
    };
  });


  // Fetch audit log records
  //
  N.wire.on(apiPath, async function fetch_log(env) {
    env.res.club = await sanitize_club(N, env.data.club, env.user_info);

    let records = await N.models.clubs.ClubAuditLog.find()
                            .where('club').equals(env.data.club._id)
                            .lean(true);

    // TODO: sanitize and format
    //env.res.log_records = records;
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
