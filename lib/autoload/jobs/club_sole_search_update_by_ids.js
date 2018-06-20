// Add clubs to search index
//
'use strict';


const docid_clubs = require('nodeca.clubs/lib/search/docid_clubs');
const userInfo    = require('nodeca.users/lib/user_info');


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

        let user_info = await userInfo(N, null);
        let access_env = { params: { clubs, user_info } };

        await N.wire.emit('internal:clubs.access.club', access_env);

        let is_club_public = {};

        clubs.forEach((club, idx) => {
          is_club_public[club._id] = access_env.data.access_read[idx];
        });

        let values = [];
        let args = [];

        for (let club of clubs) {
          values.push('(?,?,?,?,?)');

          args.push(
            // id
            docid_clubs(N, club.hid),
            // title
            club.title,
            // description
            club.description || '',
            // object_id
            String(club._id),
            // public
            is_club_public[club._id] ? 1 : 0
          );
        }

        let query = `
          REPLACE INTO club_sole
          (id, title, description, object_id, public)
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
