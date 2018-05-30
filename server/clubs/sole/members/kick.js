// Kick user from the club
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


  // Fetch user
  //
  N.wire.before(apiPath, async function fetch_user(env) {
    env.data.user = await N.models.users.User.findById(env.params.user_id)
                              .where('exists').equals(true)
                              .lean(true);

    if (!env.data.user) throw N.io.NOT_FOUND;
  });


  // Get club membership for that user, check that he isn't an owner
  //
  N.wire.before(apiPath, async function check_target_user_membership(env) {
    let membership = await N.models.clubs.Membership.findOne()
                               .where('user').equals(env.data.user._id)
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    if (membership && membership.is_owner) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_user_is_owner')
      };
    }
  });


  // Kick target user from the club
  //
  N.wire.on(apiPath, async function kick_user(env) {
    await N.models.clubs.Membership.remove(
      { club: env.data.club._id, user: env.data.user._id },
    );

    await N.models.clubs.Club.updateMembers(env.data.club._id);
  });
};