// Stop post rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, async function club_posts_rebuild_stop() {
    await N.queue.cancel('club_posts_rebuild');
  });
};
