// Index selected clubs with all topics and all posts inside
//
'use strict';


const _        = require('lodash');
const Queue    = require('idoit');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 1;
const TOPICS_PER_CHUNK = 100;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_club_sole_search_update_with_topics() {

    N.queue.registerTask({
      name: 'club_sole_search_update_with_topics',
      pool: 'hard',
      baseClass: Queue.GroupTemplate,

      // 10 minute delay by default
      postponeDelay: 10 * 60 * 1000,

      init() {
        let [ ids ] = this.args;

        let tasks = [];

        tasks = tasks.concat(ids.map(club_id =>
          N.queue.club_topics_search_update_by_club(club_id)
        ));

        tasks = tasks.concat(ids.map(club_id =>
          N.queue.club_posts_search_update_by_club(club_id)
        ));

        tasks.unshift(N.queue.club_sole_search_update_by_ids(ids));

        return tasks;
      }
    });


    // Task to index club topics from a selected club (only used internally)
    //
    N.queue.registerTask({
      name: 'club_topics_search_update_by_club',
      pool: 'hard',
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'club_topics_search_update_by_club',

      async iterate(state) {
        let active_chunks = this.children_created - this.children_finished;


        // Idle if we still have more than `CHUNKS_MIN_COUNT` chunks
        //
        if (active_chunks >= CHUNKS_MIN_COUNT) return {};


        // Fetch topic _ids
        //
        let query = N.models.clubs.Topic.find()
                        .where('club').equals(this.args[0])
                        .select('_id')
                        .sort({ _id: -1 })
                        .limit(TOPICS_PER_CHUNK * CHUNKS_TO_ADD)
                        .lean(true);

        // If state is present it is always smaller than max _id
        if (state) {
          query.where('_id').lt(state);
        }

        let topics = await query;


        // Check finished
        //
        if (!topics.length) return null;


        // Add chunks
        //
        let chunks = _.chunk(topics.map(p => String(p._id)), TOPICS_PER_CHUNK)
                      .map(ids => N.queue.club_topics_search_update_by_ids(ids));

        return {
          tasks: chunks,
          state: String(topics[topics.length - 1]._id)
        };
      }
    });


    // Task to index club posts from a selected club (only used internally)
    //
    N.queue.registerTask({
      name: 'club_posts_search_update_by_club',
      pool: 'hard',
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'club_posts_search_update_by_club',

      async iterate(state) {
        let active_chunks = this.children_created - this.children_finished;


        // Idle if we still have more than `CHUNKS_MIN_COUNT` chunks
        //
        if (active_chunks >= CHUNKS_MIN_COUNT) return {};


        // Fetch topic _ids
        //
        let query = N.models.clubs.Post.find()
                        .where('club').equals(this.args[0])
                        .select('_id')
                        .sort({ _id: -1 })
                        .limit(TOPICS_PER_CHUNK * CHUNKS_TO_ADD)
                        .lean(true);

        // If state is present it is always smaller than max _id
        if (state) {
          query.where('_id').lt(state);
        }

        let posts = await query;


        // Check finished
        //
        if (!posts.length) return null;


        // Add chunks
        //
        let chunks = _.chunk(posts.map(p => String(p._id)), TOPICS_PER_CHUNK)
                      .map(ids => N.queue.club_posts_search_update_by_ids(ids));

        return {
          tasks: chunks,
          state: String(posts[posts.length - 1]._id)
        };
      }
    });
  });
};