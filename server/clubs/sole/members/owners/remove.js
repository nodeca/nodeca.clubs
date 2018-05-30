// Revoke ownership status from yourself or another user,
// or revoke ownership request sent to another user
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    nick:    { type: 'string', required: true },
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


  // Fetch user by nick
  //
  N.wire.before(apiPath, async function fetch_user(env) {
    env.data.user = await N.models.users.User.findOne()
                              .where('nick').equals(env.params.nick)
                              .where('exists').equals(true)
                              .lean(true);

    if (!env.data.user) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_user_not_found')
      };
    }
  });


  // Prevent resigning if user is the last owner
  //
  N.wire.before(apiPath, async function check_last_owner(env) {
    if (String(env.data.user._id) !== env.user_info.user_id) return;

    let owner_count = await N.models.clubs.Membership.count()
                                .where('club').equals(env.data.club._id)
                                .where('is_owner').equals(true);

    if (owner_count <= 1) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_last_owner')
      };
    }
  });


  // Revoke ownership or ownership request to user
  //
  N.wire.on(apiPath, async function remove_from_block_list(env) {
    // revoke ownership, does nothing if not a member yet
    await N.models.clubs.Membership.update(
      { club: env.data.club._id, user: env.data.user._id },
      { $set: { is_owner: false } }
    );

    // revoke ownership request
    await N.models.clubs.OwnershipPending.remove(
      { club: env.data.club._id, user: env.data.user._id }
    );

    await N.models.clubs.Club.updateMembers(env.data.club._id);
  });
};
