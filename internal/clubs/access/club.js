// Stub for embed, clubs are always visible
//

'use strict';


module.exports = function (N/*, apiPath*/) {

  N.wire.on('internal:common.access', async function check_post_access(access_env) {
    let match = N.router.matchAll(access_env.params.url).reduce(
      (acc, match) => match.meta.methods.get === 'clubs.sole',
      null);

    if (!match) return;

    access_env.data.access_read = true;
  });
};
