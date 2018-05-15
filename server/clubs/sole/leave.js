// Leave a club
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


  // Leave club
  //
  N.wire.on(apiPath, async function club_leave(env) {
    // not a member - nothing to do
    if (!env.data.is_club_member) return;

    // prevent leaving if user is the last owner
    if (env.data.is_club_owner) {
      let owner_count = await N.models.clubs.Membership.count()
                                  .where('club').equals(env.data.club._id)
                                  .where('is_owner').equals(true);

      if (owner_count <= 1) {
        throw {
          code: N.io.CLIENT_ERROR,
          message: env.t('err_last_owner')
        };
      }
    }

    // remove membership record
    await N.models.clubs.Membership.remove(
      { club: env.data.club._id, user: env.user_info.user_id },
    );

    await N.models.clubs.Club.updateMembers(env.data.club._id);
  });
};
