// Search for a club
//
// It's a placeholder page, shows search input only;
// it doesn't return any results to prevent heavy load from bots
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    $query: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      },
      required: false,
      additionalProperties: false
    }
  });


  // Fill head meta
  //
  N.wire.on(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');

    env.res.query = env.params.$query?.query || '';
  });


  // Fill breadcrumbs
  //
  N.wire.after(apiPath, function fill_breadcrumbs(env) {
    env.data.breadcrumbs = [];

    env.data.breadcrumbs.push({
      text: env.t('@common.menus.navbar.clubs'),
      route: 'clubs.index'
    });

    env.data.breadcrumbs.push({
      text: env.t('breadcrumbs_title')
    });

    env.res.breadcrumbs = env.data.breadcrumbs;
  });


  // Fetch and fill permissions
  //
  N.wire.after(apiPath, async function fetch_and_fill_permissions(env) {
    env.res.settings = await env.extras.settings.fetch([
      'clubs_can_create_clubs',
      'clubs_club_title_max_length'
    ]);
  });
};
