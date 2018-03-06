// Club page
//

'use strict';


const _             = require('lodash');
const sanitize_club = require('nodeca.clubs/lib/sanitizers/club');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid: { type: 'integer', minimum: 1, required: true }
  });


  // Fetch club
  //
  N.wire.before(apiPath, async function fetch_club(env) {
    let club = await N.models.clubs.Club.findOne()
                         .where('hid').equals(env.params.club_hid)
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;
    env.res.club = await sanitize_club(N, club, env.user_info);
  });


  // Fetch club administrators
  //
  N.wire.before(apiPath, async function fetch_club_admins(env) {
    let membership = await N.models.clubs.ClubMember.find()
                               .where('club').equals(env.data.club._id)
                               .where('is_owner').equals(true)
                               .sort('joined_ts')
                               .lean(true);

    env.res.club_admin_ids = _.map(membership, 'user');

    env.data.users = (env.data.users || []).concat(env.res.club_admin_ids);
  });


  N.wire.on(apiPath, function clubs_sole(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.data.club.title;

    env.data.breadcrumbs = [];

    env.data.breadcrumbs.push({
      text: env.t('@common.menus.navbar.clubs'),
      route: 'clubs.index'
    });

    env.data.breadcrumbs.push({
      text: env.data.club.title,
      route: 'clubs.sole',
      params: { club_hid: env.data.club.hid }
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
    env.res.users = { undefined: { name: 'Bo (demond_fadel) Hagenes', hid: 1 } };
  });
};
