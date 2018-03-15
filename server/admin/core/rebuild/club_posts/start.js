// Start post rebuild
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {});

  N.wire.on(apiPath, async function club_posts_rebuild_start() {
    await N.queue.club_posts_rebuild().run();
  });
};
