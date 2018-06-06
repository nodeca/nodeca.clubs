// Reject user membership request
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
    let settings = await env.extras.settings.fetch([
      'clubs_lead_can_edit_club_members',
      'clubs_mod_can_edit_club_members'
    ]);

    if (env.data.is_club_owner && settings.clubs_lead_can_edit_club_members) return;
    if (settings.clubs_mod_can_edit_club_members) return;

    throw N.io.NOT_FOUND;
  });


  // Remove membership request
  //
  N.wire.on(apiPath, async function remove_request(env) {
    await N.models.clubs.MembershipPending.remove(
      { user: env.params.user_id, club: env.data.club._id }
    );
  });
};
