// Search club names/descriptions
//

'use strict';


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    properties: {
      query: { type: 'string', required: true }
    },
    additionalProperties: true
  });


  N.wire.on(apiPath, async function search_execute(env) {
    let query = env.params.query && env.params.query.trim() ? env.params.query : '';

    env.res.query = query;

    // check query length because 1-character requests consume too much resources
    if (query.trim().length < 2) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_query_too_short')
      };
    }

    let search_env = {
      params: {
        user_info: env.user_info,
        query
      }
    };

    await N.wire.emit('internal:search.club_sole', search_env);

    env.res.clubs = search_env.results.map(({ club }) => club);
    env.data.users = (env.data.users || []).concat(search_env.users);
  });
};
