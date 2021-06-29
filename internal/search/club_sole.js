// Execute search in clubs
//
// In:
//
// - params.query
// - params.sort
// - params.skip
// - params.limit
// - params.user_info
//
// Out:
//
// - count
// - results
// - users
//

'use strict';


const _                = require('lodash');
const sanitize_club    = require('nodeca.clubs/lib/sanitizers/club');
const sphinx_escape    = require('nodeca.search').escape;


module.exports = function (N, apiPath) {

  // Send sql query to sphinx, get a response
  //
  N.wire.on(apiPath, async function execute_search(locals) {
    locals.sandbox = locals.sandbox || {};

    let query  = 'SELECT object_id FROM club_sole WHERE MATCH(?) AND public=1';
    let params = [ sphinx_escape(locals.params.query) ];

    if (!_.isNil(locals.params.limit)) {
      query += ' LIMIT ?,?';
      params.push(locals.params.skip);

      // increase limit by 1 to detect last chunk (only if limit != 0)
      params.push(locals.params.limit ? (locals.params.limit + 1) : 0);
    }

    let reached_end = false;

    let [ results, count ] = await N.search.execute([
      [ query, params ],
      "SHOW META LIKE 'total_found'"
    ]);

    if (locals.params.limit !== 0) {
      if (!_.isNil(locals.params.limit) && results.length > locals.params.limit) {
        results.pop();
      } else {
        reached_end = true;
      }

      let clubs = _.keyBy(
        await N.models.clubs.Club.find()
                  .where('_id').in(results.map(x => x.object_id))
                  .lean(true),
        '_id'
      );

      // copy clubs preserving order
      locals.sandbox.clubs = results.map(result => clubs[result.object_id]).filter(Boolean);
    } else {
      locals.sandbox.clubs = [];
    }

    locals.count = Number(count[0].Value);
    locals.reached_end = reached_end;
  });


  // Check permissions for each club
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.clubs.length) return;

    let access_env = { params: {
      clubs: locals.sandbox.clubs,
      user_info: locals.params.user_info
    } };

    await N.wire.emit('internal:clubs.access.club', access_env);

    locals.sandbox.clubs = locals.sandbox.clubs.filter((club, idx) => access_env.data.access_read[idx]);
  });


  // Sanitize results
  //
  N.wire.on(apiPath, async function sanitize(locals) {
    if (!locals.sandbox.clubs.length) return;

    locals.sandbox.clubs = await sanitize_club(N, locals.sandbox.clubs, locals.params.user_info);
  });


  // Fill results
  //
  N.wire.on(apiPath, function fill_results(locals) {
    locals.results = [];

    locals.sandbox.clubs.forEach(club => {
      locals.results.push({ club });
    });
  });
};
