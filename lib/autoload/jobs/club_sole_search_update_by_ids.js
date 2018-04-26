// Add clubs to search index
//
'use strict';


const docid_clubs = require('nodeca.clubs/lib/search/docid_clubs');


module.exports = function (N) {

  N.wire.on('init:jobs', function register_club_sole_search_update_by_ids() {

    N.queue.registerTask({
      name: 'club_sole_search_update_by_ids',
      pool: 'hard',
      removeDelay: 3600,
      async process(ids, options = {}) {
        let clubs = await N.models.clubs.Club.find()
                               .where('_id').in(ids)
                               .lean(true);

        if (!clubs.length) return;

        let values = [];
        let args = [];

        for (let club of clubs) {
          values.push('(?,?,?,?)');

          args.push(
            // id
            docid_clubs(N, club.hid),
            // title
            club.title,
            // description
            club.description || '',
            // object_id
            String(club._id)
          );
        }

        let query = `
          REPLACE INTO club_sole
          (id, title, description, object_id)
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
