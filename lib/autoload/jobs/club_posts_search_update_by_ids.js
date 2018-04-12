// Add club posts to search index
//
'use strict';


const _            = require('lodash');
const docid_posts  = require('nodeca.clubs/lib/search/docid_posts');
const docid_topics = require('nodeca.clubs/lib/search/docid_topics');
const docid_clubs  = require('nodeca.clubs/lib/search/docid_clubs');
const userInfo     = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  N.wire.on('init:jobs', function register_club_posts_search_update_by_ids() {

    N.queue.registerTask({
      name: 'club_posts_search_update_by_ids',
      pool: 'hard',
      removeDelay: 3600,
      async process(ids, options = {}) {
        let posts = await N.models.clubs.Post.find()
                              .where('_id').in(ids)
                              .lean(true);

        if (!posts.length) return;

        let topics = await N.models.clubs.Topic.find()
                               .where('_id').in(_.uniq(posts.map(post => String(post.topic))))
                               .lean(true);

        let clubs = await N.models.clubs.Club.find()
                              .where('_id').in(_.uniq(topics.map(topic => String(topic.club))))
                              .lean(true);

        let topics_by_id = _.keyBy(topics, '_id');
        let clubs_by_id  = _.keyBy(clubs, '_id');

        let user_info = await userInfo(N, null);

        let access_env = { params: {
          posts,
          user_info,
          preload: topics
        } };

        await N.wire.emit('internal:clubs.access.post', access_env);

        let is_post_public = {};

        posts.forEach((post, idx) => {
          is_post_public[post._id] = access_env.data.access_read[idx];
        });

        let values = [];
        let args = [];

        for (let post of posts) {
          let topic = topics_by_id[post.topic];

          if (!topic) {
            N.logger.error(`Cannot find club topic ${post.topic} referred by post ${post._id}`);
            continue;
          }

          let club = clubs_by_id[topic.club];

          if (!club) {
            N.logger.error(`Cannot find club ${topic.club} referred by topic ${topic._id}`);
            continue;
          }

          // only check `st` for posts assuming st=HB,ste=VISIBLE posts aren't public
          let visible = post.st === N.models.clubs.Post.statuses.VISIBLE &&
                        N.models.clubs.Topic.statuses.LIST_VISIBLE.indexOf(topic.st) !== -1;

          values.push('(?,?,?,?,?,?,?,?)');

          args.push(
            // id
            docid_posts(N, topic.hid, post.hid),
            // content
            post.html,
            // object_id
            String(post._id),
            // topic_uid
            docid_topics(N, topic.hid),
            // club_uid
            docid_clubs(N, club.hid),
            // public
            (is_post_public[post._id] && visible) ? 1 : 0,
            // visible
            visible ? 1 : 0,
            // ts
            Math.floor(post.ts / 1000)
          );
        }

        let query = `
          REPLACE INTO club_posts
          (id, content, object_id, topic_uid, club_uid, public, visible, ts)
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
