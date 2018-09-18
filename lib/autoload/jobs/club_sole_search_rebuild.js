// Reindex all clubs (iterator started from admin interface)
//
'use strict';


const _        = require('lodash');
const Queue    = require('idoit');


const CHUNKS_TO_ADD    = 100;
const CHUNKS_MIN_COUNT = 1;
const CLUBS_PER_CHUNK  = 100;


module.exports = function (N) {

  N.wire.on('init:jobs', function register_club_sole_search_rebuild() {

    N.queue.registerTask({
      name: 'club_sole_search_rebuild',
      pool: 'hard',
      baseClass: Queue.IteratorTemplate,
      taskID: () => 'club_sole_search_rebuild',

      async iterate(state) {
        if (this.total === 0) return null;

        let active_chunks = this.children_created - this.children_finished;


        // Idle if we still have more than `CHUNKS_MIN_COUNT` chunks
        //
        if (active_chunks >= CHUNKS_MIN_COUNT) return {};


        // Fetch club _id
        //
        let query = N.models.clubs.Club.find()
                        .where('_id').gte(this.args[0]) // min
                        .select('_id')
                        .sort({ _id: -1 })
                        .limit(CLUBS_PER_CHUNK * CHUNKS_TO_ADD)
                        .lean(true);

        // If state is present it is always smaller than max _id
        if (state) {
          query.where('_id').lt(state);
        } else {
          query.where('_id').lte(this.args[1]); // max
        }

        let clubs = await query;


        // Check finished
        //
        if (!clubs.length) return null;


        // Add chunks
        //
        let chunks = _.chunk(clubs.map(t => String(t._id)), CLUBS_PER_CHUNK)
                      .map(ids => N.queue.club_sole_search_update_by_ids(ids, { shadow: true }));

        return {
          tasks: chunks,
          state: String(clubs[clubs.length - 1]._id)
        };
      },

      async init() {
        // set min _id and max _id
        // (arguments are ignored for club reindex only because
        // it happens fast enough for us to not want cutoff)
        let min_club = await N.models.clubs.Club.findOne()
                                  .select('_id')
                                  .sort({ _id: 1 })
                                  .lean(true);

        if (!min_club) {
          this.total = 0;
          return;
        }

        this.args[0] = String(min_club._id);

        let max_club = await N.models.clubs.Club.findOne()
                                  .select('_id')
                                  .sort({ _id: -1 })
                                  .lean(true);

        if (!max_club) {
          this.total = 0;
          return;
        }

        this.args[1] = String(max_club._id);

        let clubs_count = await N.models.clubs.Club.count();

        this.total = Math.ceil(clubs_count / CLUBS_PER_CHUNK);
      }
    });
  });
};
