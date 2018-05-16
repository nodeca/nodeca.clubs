// Join a club
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid: { type: 'integer', required: true }
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


  // Fetch club membership
  //
  N.wire.before(apiPath, async function fetch_club_membership(env) {
    let membership = await N.models.clubs.Membership.findOne()
                               .where('user').equals(env.user_info.user_id)
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    env.data.is_club_member = !!membership;
    env.data.is_club_owner  = !!membership && membership.is_owner;
  });


  // Check if user is blocked from this club
  //
  N.wire.before(apiPath, async function check_block(env) {
    // already a member - nothing to do
    if (env.data.is_club_member) return;

    let block = await N.models.clubs.Blocked.findOne()
                          .where('user').equals(env.user_info.user_id)
                          .where('club').equals(env.data.club._id);

    if (!block) return;

    throw {
      code: N.io.CLIENT_ERROR,
      message: env.t('err_blocked')
    };
  });


  // Join club
  //
  N.wire.on(apiPath, async function club_join(env) {
    // already a member - nothing to do
    if (env.data.is_club_member) return;

    // create membership record, use upsert to avoid race condition duplicates
    await N.models.clubs.Membership.update(
      { club: env.data.club._id, user: env.user_info.user_id },
      { $set: { is_owner: false, joined_ts: new Date() } },
      { upsert: true }
    );

    await N.models.clubs.Club.updateMembers(env.data.club._id);
  });
};
