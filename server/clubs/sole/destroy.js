// Mark club as deleted
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


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let clubs_mod_can_delete_clubs = await env.extras.settings.fetch('clubs_mod_can_delete_clubs');

    if (!clubs_mod_can_delete_clubs) throw N.io.FORBIDDEN;
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


  // Remove club
  //
  N.wire.on(apiPath, function club_remove(env) {
    return N.models.clubs.Club.update({ _id: env.data.club._id }, { $set: { exists: false } });
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function update_search_index(env) {
    await N.queue.club_sole_search_update_with_topics([ env.data.club._id ]).postpone();
  });
};
