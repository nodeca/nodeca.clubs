// Get posts list with all data needed to render
//
// in:
//
// - env.data.topic_hid
// - env.data.build_posts_ids (env, callback) -
//       should fill either `env.data.posts_ids` or `env.data.posts_hids`
//
// out:
//
//   env:
//     res:
//       settings: ...
//       topic: ...         # sanitized, with restricted fields
//       posts: ...         # array, sanitized, with restricted fields
//       club: ...          # { hid: ... }
//       own_bookmarks: ... # array of posts ids bookmarked by user
//       own_votes: ...     # hash of votes owned by user ({ <post_id>: <value> })
//       infractions: ...   # hash of infractions ({ <post_id>: <infraction> })
//     data:
//       posts_visible_statuses: ...
//       settings: ...
//       topic: ...
//       posts: ...
//       club: ...
//       own_bookmarks: ...
//       own_votes: ...
//
'use strict';


const sanitize_club  = require('nodeca.clubs/lib/sanitizers/club');
const sanitize_topic = require('nodeca.clubs/lib/sanitizers/topic');
const sanitize_post  = require('nodeca.clubs/lib/sanitizers/post');

const fields = require('./_fields/post_list.js');


module.exports = function (N, apiPath) {

  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    let topic = await N.models.clubs.Topic.findOne()
                          .where('hid').equals(env.data.topic_hid)
                          .lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
  });


  // Fetch club
  //
  N.wire.before(apiPath, async function fetch_club(env) {
    let club = await N.models.clubs.Club.findById(env.data.topic.club)
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;
  });


  // Fetch and fill permissions
  //
  N.wire.before(apiPath, async function fetch_and_fill_permissions(env) {
    env.res.settings = env.data.settings = await env.extras.settings.fetch(fields.settings);
  });


  // Fetch club membership
  //
  N.wire.before(apiPath, async function fetch_club_membership(env) {
    let membership = await N.models.clubs.Membership.findOne()
                               .where('user').equals(env.user_info.user_id)
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    env.res.is_club_member = env.data.is_club_member = !!membership;
    env.res.is_club_owner  = env.data.is_club_owner  = !!membership?.is_owner;
  });


  // Check access permissions
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      topics: env.data.topic,
      user_info: env.user_info,
      preload: [ env.data.club ]
    } };

    await N.wire.emit('internal:clubs.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Define visible post statuses
  //
  N.wire.before(apiPath, function define_visible_post_st(env) {
    let statuses = N.models.clubs.Post.statuses;

    let postVisibleSt = [ statuses.VISIBLE ];

    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      postVisibleSt.push(statuses.HB);
    }

    if (env.data.settings.clubs_mod_can_delete_topics) {
      postVisibleSt.push(statuses.DELETED);
    }

    if (env.data.settings.clubs_mod_can_see_hard_deleted_topics) {
      postVisibleSt.push(statuses.DELETED_HARD);
    }

    env.data.posts_visible_statuses = postVisibleSt;
  });


  // Get posts ids
  //
  N.wire.before(apiPath, async function get_posts_ids(env) {
    await env.data.build_posts_ids(env);
  });


  // Fetch posts
  //
  N.wire.on(apiPath, async function fetch_posts(env) {
    let by_hid = !!env.data.posts_hids;

    let posts = await N.models.clubs.Post.find()
                          .where(by_hid ? 'hid' : '_id').in(env.data[by_hid ? 'posts_hids' : 'posts_ids'])
                          .where('st').in(env.data.posts_visible_statuses)
                          .where('topic').equals(env.data.topic._id)
                          .lean(true);

    // 1. Fill `env.data.posts_ids` if doesn't yet exist (if selecting by hids)
    // 2. Push results to `env.data.posts` in `env.data.posts_ids` order
    //
    let postsById = posts.reduce((acc, p) => {
      acc[by_hid ? p.hid : p._id] = p;
      return acc;
    }, {});

    env.data.posts = [];

    if (by_hid) {
      env.data.posts_ids = [];
    }

    env.data[by_hid ? 'posts_hids' : 'posts_ids'].forEach(id => {
      let post = postsById[id];

      if (post) {
        env.data.posts.push(post);
      }

      if (by_hid) {
        env.data.posts_ids.push(post._id);
      }
    });
  });


  // Fetch and fill bookmarks
  //
  N.wire.after(apiPath, async function fetch_and_fill_bookmarks(env) {
    let bookmarks = await N.models.users.Bookmark.find()
                              .where('user').equals(env.user_info.user_id)
                              .where('src').in(env.data.posts_ids)
                              .lean(true);

    env.data.own_bookmarks = bookmarks;

    if (!bookmarks.length) return;

    env.res.own_bookmarks = bookmarks.map(x => x.src);
  });


  // Fetch and fill votes
  //
  N.wire.after(apiPath, async function fetch_and_fill_votes(env) {
    let votes = await N.models.users.Vote.find()
                          .where('from').equals(env.user_info.user_id)
                          .where('for').in(env.data.posts_ids)
                          .where('value').in([ 1, -1 ])
                          .lean(true);

    env.data.own_votes = votes;

    if (!votes.length) return;

    // [ { _id: ..., for: '562f3569c5b8d831367b0585', value: -1 } ] -> { 562f3569c5b8d831367b0585: -1 }
    env.res.own_votes = votes.reduce((acc, vote) => {
      acc[vote.for] = vote.value;
      return acc;
    }, {});
  });


  // Fetch infractions
  //
  N.wire.after(apiPath, async function fetch_infractions(env) {
    let settings = await env.extras.settings.fetch([
      'clubs_mod_can_add_infractions',
      'can_see_infractions'
    ]);

    if (!settings.can_see_infractions && !settings.clubs_mod_can_add_infractions) return;

    let infractions = await N.models.users.Infraction.find()
                                .where('src').in(env.data.posts_ids)
                                .where('exists').equals(true)
                                .select('src points ts')
                                .lean(true);

    env.res.infractions = infractions.reduce((acc, infraction) => {
      acc[infraction.src] = infraction;
      return acc;
    }, {});
  });


  // Collect users
  //
  N.wire.after(apiPath, function collect_users(env) {
    env.data.users = env.data.users || [];

    if (env.data.topic.del_by) {
      env.data.users.push(env.data.topic.del_by);
    }

    env.data.posts.forEach(post => {
      if (post.user) {
        env.data.users.push(post.user);
      }
      if (post.to_user) {
        env.data.users.push(post.to_user);
      }
      if (post.del_by) {
        env.data.users.push(post.del_by);
      }
      if (post.import_users) {
        env.data.users = env.data.users.concat(post.import_users);
      }
    });
  });


  // Check if any users are ignored
  //
  N.wire.after(apiPath, async function check_ignores(env) {
    let users = env.data.posts.map(post => post.user).filter(Boolean);

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


  // Sanitize and fill posts
  //
  N.wire.after(apiPath, async function posts_sanitize_and_fill(env) {
    env.res.posts = await sanitize_post(N, env.data.posts, env.user_info);
    env.res.topic = await sanitize_topic(N, env.data.topic, env.user_info);
    env.res.club  = await sanitize_club(N, env.data.club, env.user_info);
  });
};
