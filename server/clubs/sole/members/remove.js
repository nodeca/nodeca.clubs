// Remove user from the club without banning
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


  // Check if user has an access to this club
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { clubs: env.data.club, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.club', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
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
    await N.models.clubs.Membership.deleteOne(
      { club: env.data.club._id, user: env.data.user._id }
    );

    await N.models.clubs.Club.updateMembers(env.data.club._id);
  });
};
