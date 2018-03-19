// Mark all topics in club as read
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    // club hid
    hid: { type: 'integer', required: true }
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
                              .where('hid').equals(env.params.hid)
                              .lean(true);

    if (!env.data.club) throw N.io.NOT_FOUND;
  });


  // Mark topics as read
  //
  N.wire.on(apiPath, async function mark_topics_read(env) {
    await N.models.users.Marker.markAll(env.user_info.user_id, env.data.club._id);
  });
};
