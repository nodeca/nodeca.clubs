// Restore deleted club
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


  // Restore club
  //
  N.wire.on(apiPath, function club_restore(env) {
    return N.models.clubs.Club.update({ _id: env.data.club._id }, { $set: { exists: true } });
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function update_search_index(env) {
    await N.queue.club_sole_search_update_by_ids([ env.data.club._id ]).postpone();
  });
};