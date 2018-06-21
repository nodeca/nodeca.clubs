// User accepts an invite to be owner of a club
// by clicking on a link received by email/pm
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid:   { type: 'integer', required: true },
    secret_key: { type: 'string', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Fetch club
  //
  N.wire.before(apiPath, async function fetch_club(env) {
    env.data.club = await N.models.clubs.Club.findOne()
                              .where('hid').equals(env.params.club_hid)
                              .lean(true);

    if (!env.data.club) throw N.io.NOT_FOUND;
  });


  // Check if user has an access to this club
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { clubs: env.data.club, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.club', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Fetch ownership request
  //
  N.wire.before(apiPath, async function fetch_ownership_request(env) {
    let request = await N.models.clubs.OwnershipPending.findOne()
                            .where('user').equals(env.user_info.user_id)
                            .where('club').equals(env.data.club._id)
                            .where('secret_key').equals(env.params.secret_key)
                            .lean(true);

    if (!request) throw N.io.NOT_FOUND;
  });


  // Join club as an owner
  //
  N.wire.on(apiPath, async function club_set_owner(env) {
    // remove ban in case invited user is banned from the club
    await N.models.clubs.Blocked.remove(
      { club: env.data.club._id, user: env.user_info.user_id }
    );

    // set ownership status, join the club if isn't already there
    await N.models.clubs.Membership.update(
      { club: env.data.club._id, user: env.user_info.user_id },
      { $set: { is_owner: true }, $setOnInsert: { joined_ts: new Date() } },
      { upsert: true }
    );

    // cancel ownership requests to user
    await N.models.clubs.OwnershipPending.remove(
      { club: env.data.club._id, user: env.user_info.user_id }
    );

    // update member count
    await N.models.clubs.Club.updateMembers(env.data.club._id);
  });


  // Fill breadcrumbs info
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

    env.res.breadcrumbs = env.data.breadcrumbs;
  });


  // Create audit log record
  //
  N.wire.after(apiPath, function create_log_record(env) {
    return N.models.clubs.ClubAuditLog.create({
      club:         env.data.club._id,
      action:       'leader_confirmed',
      user:         env.user_info.user_id,
      ip:           env.req.ip,
      user_agent:   env.origin.req.headers['user-agent']
    });
  });
};
