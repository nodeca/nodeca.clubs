// Main clubs page (list of clubs user have joined)
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {});


  N.wire.on(apiPath, function clubs_index(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.t('title');

    env.data.breadcrumbs = [];

    env.data.breadcrumbs.push({
      text: env.t('@common.menus.navbar.clubs'),
      route: 'clubs.index'
    });

    env.res.breadcrumbs = env.data.breadcrumbs;
  });
};
