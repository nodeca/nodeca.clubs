// Approve user membership request
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_id: { format: 'mongo', required: true },
    club_id: { format: 'mongo', required: true }
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

    env.res.is_club_member = env.data.is_club_member = !!membership;
    env.res.is_club_owner  = env.data.is_club_owner  = !!membership && membership.is_owner;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    if (!env.data.is_club_owner) throw N.io.NOT_FOUND;
  });


  // Fetch target user and check if they requested membership
  //
  N.wire.before(apiPath, async function fetch_user(env) {
    let request = await N.models.clubs.MembershipPending.findOne()
                            .where('user').equals(env.params.user_id)
                            .where('club').equals(env.data.club._id)
                            .lean(true);

    if (!request) throw N.io.NOT_FOUND;

    // check that user exists
    env.data.user = await N.models.users.User.findById(request.user)
                              .where('exists').equals(true)
                              .lean(true);

    if (!env.data.user) throw N.io.NOT_FOUND;
  });


  // Add user to the club
  //
  N.wire.on(apiPath, async function club_join(env) {
    // create membership record, use upsert to avoid race condition duplicates
    await N.models.clubs.Membership.update(
      { club: env.data.club._id, user: env.data.user._id },
      { $setOnInsert: { is_owner: false, joined_ts: new Date() } },
      { upsert: true }
    );

    await N.models.clubs.Club.updateMembers(env.data.club._id);
  });


  // Remove membership request
  //
  N.wire.after(apiPath, async function remove_request(env) {
    await N.models.clubs.MembershipPending.remove(
      { user: env.params.user_id, club: env.data.club._id }
    );
  });
};
