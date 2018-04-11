// Fetch topics for subscriptions
//
'use strict';


const _              = require('lodash');
const sanitize_topic = require('nodeca.clubs/lib/sanitizers/topic');
const sanitize_club  = require('nodeca.clubs/lib/sanitizers/club');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', async function subscriptions_fetch_topics(env) {
    let subs = _.filter(env.data.subscriptions, { to_type: N.shared.content_type.CLUB_TOPIC });

    // Fetch topics
    let topics = await N.models.clubs.Topic.find().where('_id').in(_.map(subs, 'to')).lean(true);

    // Fetch clubs
    let clubs = await N.models.clubs.Club.find().where('_id').in(_.map(topics, 'club')).lean(true);

    // Check permissions subcall
    //
    let access_env = { params: {
      topics,
      user_info: env.user_info
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

    topics = _.keyBy(topics, '_id');
    clubs = _.keyBy(clubs, '_id');

    env.res.club_topics = topics;
    env.res.clubs = _.assign(env.res.clubs || {}, clubs);


    // Fill missed subscriptions (for deleted topic)
    //
    let missed = _.filter(subs, s => !topics[s.to] || !clubs[topics[s.to].club]);

    env.data.missed_subscriptions = env.data.missed_subscriptions || [];
    env.data.missed_subscriptions = env.data.missed_subscriptions.concat(missed);
  });
};
