// Show unsubscribe topic page
//
'use strict';


const sanitize_topic = require('nodeca.clubs/lib/sanitizers/topic');
const sanitize_club  = require('nodeca.clubs/lib/sanitizers/club');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid:  { type: 'integer', required: true },
    topic_hid: { type: 'integer', required: true }
  });


  // Redirect guests to login page
  //
  N.wire.before(apiPath, async function force_login_guest(env) {
    await N.wire.emit('internal:users.force_login_guest', env);
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    let topic = await N.models.clubs.Topic.findOne()
                          .where('hid').equals(env.params.topic_hid)
                          .lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
  });


  // Fetch club
  //
  N.wire.before(apiPath, async function fetch_club(env) {
    let club = await N.models.clubs.Club.findById(env.data.topic.club)
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;
  });


  // Check if user can view this topic
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { topics: env.data.topic, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Fill club
  //
  N.wire.on(apiPath, async function fill_club(env) {
    env.res.club = await sanitize_club(N, env.data.club, env.user_info);
  });


  // Fill topic
  //
  N.wire.after(apiPath, async function fill_topic(env) {
    env.res.topic = await sanitize_topic(N, env.data.topic, env.user_info);
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_meta(env) {
    env.res.head = env.res.head || {};

    env.res.head.title = env.t('title', { topic_title: env.data.topic.title });
  });
};
