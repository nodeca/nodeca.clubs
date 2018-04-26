// Add tasks to run during reindex
//

'use strict';


module.exports = function (N) {
  N.wire.on('internal:search.reindex.tasklist', function reindex_add_club_tasks(locals) {
    locals.push('club_sole_search_rebuild');
    locals.push('club_topics_search_rebuild');
    locals.push('club_posts_search_rebuild');
  });
};
