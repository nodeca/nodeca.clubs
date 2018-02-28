// Club page
//

'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid:  { type: 'integer', minimum: 1, required: true },
    topic_hid: { type: 'integer', minimum: 1, required: true },
    post_hid:  { type: 'integer', minimum: 1 }
  });


  N.wire.on(apiPath, function clubs_topic(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = 'Facilis dolores quam perferendis tempora blanditiis maxime';

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

    env.data.breadcrumbs.push({
      text: 'Facilis dolores quam perferendis tempora blanditiis maxime',
      route: 'clubs.topic',
      params: { club_hid: env.params.club_hid, topic_hid: env.params.topic_hid }
    });

    env.res.breadcrumbs = env.data.breadcrumbs;

    /* eslint-disable max-len */
    env.res.posts = [
      {
        hid: 1,
        ts: new Date('2013-01-01'),
        html: 'Nobis amet quasi rerum mollitia ut iure aperiam incidunt. Natus modi eius inventore quasi. Necessitatibus consequatur maiores velit aut quam quaerat dolores et. Sunt iste similique ut eveniet nulla maiores.',
        votes: 0
      },
      {
        hid: 2,
        ts: new Date('2014-01-01'),
        html: 'Aspernatur enim asperiores debitis sapiente. Qui aspernatur sed aut in omnis rerum praesentium. Voluptatibus ullam autem corporis doloribus occaecati numquam voluptatibus. Enim non perspiciatis beatae repellendus aut nihil dolorem cum. Repudiandae quia odit dolores.',
        votes: 0
      },
      {
        hid: 3,
        ts: new Date('2015-01-01'),
        html: 'Optio consequatur magnam magnam tempore iste corrupti quia exercitationem. Et unde sed qui odio et. Facere ut iusto ullam. Ut sed quaerat nisi.',
        votes: 0
      }
    ];
    env.res.settings = {};
    env.res.ignored_users = {};
    env.res.own_bookmarks = [];
    env.res.subscriptions = [];
    env.res.topic = {
      hid: 1,
      title: 'Facilis dolores quam perferendis tempora blanditiis maxime'
    };
    env.res.club = { hid: 1 };
    env.res.users = { undefined: { name: 'Bo (demond_fadel) Hagenes', hid: 1 } };
  });
};
