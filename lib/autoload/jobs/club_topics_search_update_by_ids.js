// Add club topics to search index
//
'use strict';


const _            = require('lodash');
const docid_topics = require('nodeca.clubs/lib/search/docid_topics');
const docid_clubs  = require('nodeca.clubs/lib/search/docid_clubs');
const userInfo     = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  N.wire.on('init:jobs', function register_club_topics_search_update_by_ids() {

    N.queue.registerTask({
      name: 'club_topics_search_update_by_ids',
      pool: 'hard',
      removeDelay: 3600,
      async process(ids, options = {}) {
        let topics = await N.models.clubs.Topic.find()
                               .where('_id').in(ids)
                               .lean(true);

        if (!topics.length) return;

        let clubs = await N.models.clubs.Club.find()
                                 .where('_id').in(_.uniq(topics.map(topic => String(topic.club))))
                                 .lean(true);

        let clubs_by_id = _.keyBy(clubs, '_id');

        let user_info = await userInfo(N, null);
        let access_env = { params: { topics, user_info } };

        await N.wire.emit('internal:clubs.access.topic', access_env);

        let is_topic_public = {};

        topics.forEach((topic, idx) => {
          is_topic_public[topic._id] = access_env.data.access_read[idx];
        });

        let values = [];
        let args = [];

        for (let topic of topics) {
          let club = clubs_by_id[topic.club];

          if (!club) {
            N.logger.error(`Cannot find club ${topic.club} referred by topic ${topic._id}`);
            continue;
          }

          let visible = N.models.clubs.Topic.statuses.LIST_VISIBLE.indexOf(topic.st) !== -1;

          values.push('(?,?,?,?,?,?,?,?)');

          args.push(
            // id
            docid_topics(N, topic.hid),
            // content
            topic.title,
            // object_id
            String(topic._id),
            // club_uid
            docid_clubs(N, club.hid),
            // post_count
            topic.cache.post_count,
            // public
            (is_topic_public[topic._id] && visible) ? 1 : 0,
            // visible
            visible ? 1 : 0,
            // ts
            Math.floor(topic.cache.last_ts / 1000)
          );
        }

        let query = `
          REPLACE INTO club_topics
          (id, content, object_id, club_uid, post_count, public, visible, ts)
          VALUES ${values.join(', ')}
        `.replace(/\n\s*/mg, '');

        if (options.shadow) {
          await N.search.execute_shadow(query, args);
        } else {
          await N.search.execute(query, args);
        }
      }
    });
  });
};
