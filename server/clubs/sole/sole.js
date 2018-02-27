// Club page
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid: { type: 'integer', minimum: 1, required: true }
  });


  N.wire.on(apiPath, function clubs_sole(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = 'Omnis est voluptates sint quia';

    env.data.breadcrumbs = [];

    env.data.breadcrumbs.push({
      text: env.t('@common.menus.navbar.clubs'),
      route: 'clubs.index'
    });

    env.data.breadcrumbs.push({
      text: 'Omnis est voluptates sint quia',
      route: 'clubs.sole',
      params: { club_hid: env.params.club_hid }
    });

    env.res.breadcrumbs = env.data.breadcrumbs;

    env.res.topics = [
      {
        hid: 1,
        title: 'Facilis dolores quam perferendis tempora blanditiis maxime',
        cache: {
          first_ts: new Date('2014-01-01'),
          last_ts: new Date('2014-01-01'),
          post_count: 10
        },
        views_count: 0
      },
      {
        hid: 2,
        title: 'Culpa magni dolor sit magnam dolores laborum ut',
        cache: {
          first_ts: new Date('2013-01-01'),
          last_ts: new Date('2013-01-01'),
          post_count: 1
        },
        views_count: 0
      },
      {
        hid: 3,
        title: 'In autem suscipit magni unde aspernatur repellat dolor',
        cache: {
          first_ts: new Date('2012-01-01'),
          last_ts: new Date('2012-01-01'),
          post_count: 162
        },
        views_count: 0
      },
      {
        hid: 4,
        title: 'Sit illo ratione consequuntur quisquam eaque sapiente',
        cache: {
          first_ts: new Date('2011-01-01'),
          last_ts: new Date('2011-01-01'),
          post_count: 89
        },
        views_count: 0
      },
      {
        hid: 5,
        title: 'Repellendus suscipit id ut delectus exercitationem',
        cache: {
          first_ts: new Date('2010-01-01'),
          last_ts: new Date('2010-01-01'),
          post_count: 68
        },
        views_count: 0
      }
    ];

    env.res.settings = {};
    env.res.read_marks = { undefined: {} };
    env.res.ignored_users = {};
    env.res.own_bookmarks = [];
    env.res.subscriptions = [];
    env.res.section = {};
    env.res.users = { undefined: { name: 'Bo (demond_fadel) Hagenes', hid: 1 } };
  });
};
