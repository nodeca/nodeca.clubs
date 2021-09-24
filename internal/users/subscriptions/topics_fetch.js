// Fetch topics for subscriptions
//
// In:
//
//  - env.user_info
//  - env.subscriptions
//
// Out:
//
//  - env.data.missed_subscriptions - list of subscriptions for deleted topics
//                                    (those subscriptions will be deleted later)
//  - env.res.read_marks
//  - env.res.club_topics, env.res.clubs - template-specific data
//
'use strict';


const _              = require('lodash');
const sanitize_topic = require('nodeca.clubs/lib/sanitizers/topic');
const sanitize_club  = require('nodeca.clubs/lib/sanitizers/club');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', async function subscriptions_fetch_topics(env) {
    let subs = env.data.subscriptions.filter(s => s.to_type === N.shared.content_type.CLUB_TOPIC);

    // Fetch topics
    let topics = await N.models.clubs.Topic.find().where('_id').in(subs.map(x => x.to)).lean(true);

    // Fetch clubs
    let clubs = await N.models.clubs.Club.find().where('_id').in(topics.map(x => x.club)).lean(true);

    // Check permissions subcall
    //
    let access_env = { params: {
      topics,
      user_info: env.user_info,
      preload: clubs
    } };

    await N.wire.emit('internal:clubs.access.topic', access_env);

    topics = topics.reduce(function (acc, topic, i) {
      if (access_env.data.access_read[i]) {
        acc.push(topic);
      }

      return acc;
    }, []);


    // Sanitize topics
    topics = await sanitize_topic(N, topics, env.user_info);

    // Sanitize clubs
    clubs = await sanitize_club(N, clubs, env.user_info);

    // Fetch read marks
    //
    let data = topics.map(topic => ({
      categoryId: topic.section,
      contentId: topic._id,
      lastPostNumber: topic.cache.last_post_hid,
      lastPostTs: topic.cache.last_ts
    }));

    let read_marks = await N.models.users.Marker.info(env.user_info.user_id, data);
    env.res.read_marks = Object.assign(env.res.read_marks || {}, read_marks);

    topics = _.keyBy(topics, '_id');
    clubs = _.keyBy(clubs, '_id');

    env.res.club_topics = topics;
    env.res.clubs = Object.assign(env.res.clubs || {}, clubs);


    // Fill missed subscriptions (for deleted topic)
    //
    let missed = subs.filter(s => !topics[s.to] || !clubs[topics[s.to].club]);

    env.data.missed_subscriptions = env.data.missed_subscriptions || [];
    env.data.missed_subscriptions = env.data.missed_subscriptions.concat(missed);
  });
};
