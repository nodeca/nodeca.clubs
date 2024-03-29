// Mark all topics in club as read
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    // club hid
    hid: { type: 'integer', required: true },
    ts:  { type: 'integer', required: true }
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


  // Check if user has an access to this club
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { clubs: env.data.club, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.club', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Mark topics as read
  //
  N.wire.on(apiPath, async function mark_topics_read(env) {
    let cuts = await N.models.users.Marker.cuts(env.user_info.user_id, [ env.data.club._id ], 'club_topic');
    let now = Date.now();

    if (now > env.params.ts && env.params.ts > cuts[env.data.club._id]) {
      await N.models.users.Marker.markByCategory(env.user_info.user_id, env.data.club._id, env.params.ts);
    }
  });
};
