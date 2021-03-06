// Execute search in club topics
//
// In:
//
// - params.query
// - params.club_hid
// - params.sort
// - params.period
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
const sanitize_topic   = require('nodeca.clubs/lib/sanitizers/topic');
const sanitize_club    = require('nodeca.clubs/lib/sanitizers/club');
const docid_clubs      = require('nodeca.clubs/lib/search/docid_clubs');
const sphinx_escape    = require('nodeca.search').escape;


module.exports = function (N, apiPath) {

  // Send sql query to sphinx, get a response
  //
  N.wire.on(apiPath, async function execute_search(locals) {
    locals.sandbox = locals.sandbox || {};

    let query  = 'SELECT object_id FROM club_topics WHERE MATCH(?) AND public=1';
    let params = [ sphinx_escape(locals.params.query) ];

    if (locals.params.club_hid) {
      query += ' AND club_uid=?';
      params.push(docid_clubs(N, locals.params.club_hid));
    }

    if (locals.params.period > 0) {
      query += ' AND ts > ?';
      // round timestamp to the lowest whole day
      params.push(Math.floor(Date.now() / (24 * 60 * 60 * 1000) - locals.params.period) * 24 * 60 * 60);
    }

    // sort is either `date` or `rel`, sphinx searches by relevance by default
    if (locals.params.sort === 'date') {
      query += ' ORDER BY ts DESC';
    }

    query += ' LIMIT ?,?';
    params.push(locals.params.skip);

    // increase limit by 1 to detect last chunk (only if limit != 0)
    params.push(locals.params.limit ? (locals.params.limit + 1) : 0);

    let reached_end = false;

    let [ results, count ] = await N.search.execute([
      [ query, params ],
      "SHOW META LIKE 'total_found'"
    ]);

    if (locals.params.limit !== 0) {
      if (results.length > locals.params.limit) {
        results.pop();
      } else {
        reached_end = true;
      }

      let topics = _.keyBy(
        await N.models.clubs.Topic.find()
                  .where('_id').in(results.map(x => x.object_id))
                  .lean(true),
        '_id'
      );

      // copy topics preserving order
      locals.sandbox.topics = results.map(result => topics[result.object_id]).filter(Boolean);

      locals.sandbox.clubs = await N.models.clubs.Club.find()
                                          .where('_id')
                                          .in(_.uniq(locals.sandbox.topics.map(topic => String(topic.club))))
                                          .lean(true);
    } else {
      locals.sandbox.topics = [];
      locals.sandbox.clubs = [];
    }

    locals.count = Number(count[0].Value);
    locals.reached_end = reached_end;
  });


  // Check permissions for each topic
  //
  N.wire.on(apiPath, async function check_permissions(locals) {
    if (!locals.sandbox.topics.length) return;

    let access_env = { params: {
      topics: locals.sandbox.topics,
      user_info: locals.params.user_info,
      preload: locals.sandbox.clubs
    } };

    await N.wire.emit('internal:clubs.access.topic', access_env);

    let clubs_by_id = _.keyBy(locals.sandbox.clubs, '_id');
    let clubs_used = {};

    locals.sandbox.topics = locals.sandbox.topics.filter((topic, idx) => {
      let club = clubs_by_id[topic.club];
      if (!club) return false;

      if (access_env.data.access_read[idx]) {
        clubs_used[club._id] = club;
        return true;
      }

      return false;
    });

    locals.sandbox.clubs = Object.values(clubs_used);
  });


  // Sanitize results
  //
  N.wire.on(apiPath, async function sanitize(locals) {
    if (!locals.sandbox.topics.length) return;

    locals.sandbox.topics = await sanitize_topic(N, locals.sandbox.topics, locals.params.user_info);
    locals.sandbox.clubs  = await sanitize_club(N, locals.sandbox.clubs, locals.params.user_info);
  });


  // Fill results
  //
  N.wire.on(apiPath, function fill_results(locals) {
    locals.results = [];

    let clubs_by_id = _.keyBy(locals.sandbox.clubs, '_id');

    locals.sandbox.topics.forEach(topic => {
      let club = clubs_by_id[topic.club];
      if (!club) return;

      locals.results.push({ topic, club });
    });
  });


  // Fill users
  //
  N.wire.on(apiPath, function fill_users(locals) {
    let users = {};

    locals.results.forEach(result => {
      let topic = result.topic;

      if (topic.cache.first_user) users[topic.cache.first_user] = true;
      if (topic.cache.last_user) users[topic.cache.last_user] = true;
      if (topic.del_by) users[topic.del_by] = true;
    });

    locals.users = Object.keys(users);
  });
};
