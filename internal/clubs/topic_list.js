// Get topics list with all data needed to render
//
// in:
//
// - env.data.club_hid
// - env.data.build_topics_ids (env, callback) - should fill `env.data.topics_ids` with correct sorting order
//
// out:
//
//   env:
//     res:
//       settings: ...
//       topic: ...         # sanitized, with restricted fields
//       posts: ...         # array, sanitized, with restricted fields
//       club: ...          # with restricted fields
//       own_bookmarks: ... # array of topics ids bookmarked by user
//       read_marks:        # hash with keys as topic ids and values is object
//                          # with fields `isNew`, `next` and `position`
//       subscriptions:     # array of topics ids subscribed by user
//     data:
//       topics_visible_statuses: ...
//       settings: ...
//       topic: ...
//       club: ...
//
'use strict';


const _              = require('lodash');
const sanitize_club  = require('nodeca.clubs/lib/sanitizers/club');
const sanitize_topic = require('nodeca.clubs/lib/sanitizers/topic');

let setting_names = [
  'can_see_hellbanned',
  'clubs_show_ignored',
  'clubs_mod_can_delete_topics',
  'clubs_mod_can_hard_delete_topics',
  'clubs_mod_can_see_hard_deleted_topics',
  'clubs_can_start_topics',
  'posts_per_page'
];


module.exports = function (N, apiPath) {

  // Fetch club
  //
  N.wire.before(apiPath, async function fetch_club(env) {
    let club = await N.models.clubs.Club.findOne()
                         .where('hid').equals(env.data.club_hid)
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;
  });


  // Fetch and fill permissions
  //
  N.wire.before(apiPath, async function fetch_and_fill_permissions(env) {
    env.res.settings = env.data.settings = await env.extras.settings.fetch(setting_names);
  });


  // Fetch club membership
  //
  N.wire.before(apiPath, async function fetch_club_membership(env) {
    let membership = await N.models.clubs.Membership.findOne()
                               .where('user').equals(env.user_info.user_id)
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    env.res.is_club_member = env.data.is_club_member = !!membership;
    env.res.is_club_owner  = env.data.is_club_owner  = !!membership && membership.is_owner;
  });


  // Define visible topic statuses
  //
  N.wire.before(apiPath, function define_visible_statuses(env) {
    let statuses = N.models.clubs.Topic.statuses;

    env.data.topics_visible_statuses = statuses.LIST_VISIBLE.slice(0);

    if (env.data.settings.clubs_mod_can_delete_topics) {
      env.data.topics_visible_statuses.push(statuses.DELETED);
    }

    if (env.data.settings.clubs_mod_can_see_hard_deleted_topics) {
      env.data.topics_visible_statuses.push(statuses.DELETED_HARD);
    }

    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      env.data.topics_visible_statuses.push(statuses.HB);
    }
  });


  // Get topics ids
  //
  N.wire.before(apiPath, async function get_topics_ids(env) {
    await env.data.build_topics_ids(env);
  });


  // Fetch and sort topics
  //
  N.wire.on(apiPath, async function fetch_and_sort_topics(env) {
    let topics = await N.models.clubs.Topic.find()
                           .where('_id').in(env.data.topics_ids)
                           .where('st').in(env.data.topics_visible_statuses)
                           .where('club').equals(env.data.club._id)
                           .lean(true);

    env.data.topics = [];

    // Sort in `env.data.topics_ids` order.
    // May be slow on large topics volumes
    env.data.topics_ids.forEach(id => {
      let topic = _.find(topics, t => t._id.equals(id));

      if (topic) {
        env.data.topics.push(topic);
      }
    });
  });


  // Fill bookmarks
  //
  N.wire.after(apiPath, async function fill_bookmarks(env) {
    let postIds = env.data.topics.map(topic => topic.cache.first_post);

    let bookmarks = await N.models.clubs.PostBookmark.find()
                              .where('user').equals(env.user_info.user_id)
                              .where('post_id').in(postIds)
                              .lean(true);

    env.res.own_bookmarks = _.map(bookmarks, 'post_id');
  });


  // Fill subscriptions for club topics
  //
  N.wire.after(apiPath, async function fill_subscriptions(env) {
    if (!env.user_info.is_member) {
      env.res.subscriptions = [];
      return;
    }

    let subscriptions = await N.models.users.Subscription.find()
                          .where('user').equals(env.user_info.user_id)
                          .where('to').in(env.data.topics_ids)
                          .where('type').in(N.models.users.Subscription.types.LIST_SUBSCRIBED)
                          .lean(true);

    env.res.subscriptions = _.map(subscriptions, 'to');
  });


  // Fill `isNew`, `next` and `position` markers
  //
  N.wire.after(apiPath, async function fill_read_marks(env) {
    let data = [];

    env.data.topics.forEach(topic => {
      data.push({
        categoryId: topic.club,
        contentId: topic._id,
        lastPostNumber: topic.last_post_counter,
        lastPostTs: topic.cache.last_ts
      });
    });

    env.res.read_marks = await N.models.users.Marker.info(env.user_info.user_id, data);
  });


  // Collect users
  //
  N.wire.after(apiPath, function collect_users(env) {
    env.data.users = env.data.users || [];

    env.data.topics.forEach(function (topic) {
      env.data.users.push(topic.cache.first_user);
      env.data.users.push(topic.cache.last_user);

      if (topic.del_by) {
        env.data.users.push(topic.del_by);
      }
    });
  });


  // Check if any users are ignored
  //
  N.wire.after(apiPath, async function check_ignores(env) {
    let users = env.data.topics.map(topic => topic.cache.first_user).filter(Boolean);

    // don't fetch `_id` to load all data from composite index
    let ignored = await N.models.users.Ignore.find()
                            .where('from').equals(env.user_info.user_id)
                            .where('to').in(users)
                            .select('from to -_id')
                            .lean(true);

    env.res.ignored_users = env.res.ignored_users || {};

    ignored.forEach(row => {
      env.res.ignored_users[row.to] = true;
    });
  });


  // Sanitize and fill topics
  //
  N.wire.after(apiPath, async function topics_sanitize_and_fill(env) {
    env.res.topics = await sanitize_topic(N, env.data.topics, env.user_info);
    env.res.club   = await sanitize_club(N, env.data.club, env.user_info);
  });
};
