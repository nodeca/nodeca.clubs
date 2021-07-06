// Show edit history
//

'use strict';


const _  = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true }
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let can_see_history = await env.extras.settings.fetch('can_see_history');

    if (!can_see_history) throw N.io.FORBIDDEN;
  });


  // Fetch post
  //
  N.wire.before(apiPath, async function fetch_post(env) {
    let post = await N.models.clubs.Post.findById(env.params.post_id).lean(true);

    if (!post) throw N.io.NOT_FOUND;

    env.data.post = post;
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    let topic = await N.models.clubs.Topic.findOne({ _id: env.data.post.topic }).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
  });


  // Check if user can see this post
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      topics: env.data.topic,
      user_info: env.user_info
    } };

    await N.wire.emit('internal:clubs.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;

    // Check permissions manually here instead of calling `clubs.access.post`
    // to account for deleted posts (history should still be shown to
    // moderators).
    //
    env.data.settings = await env.extras.settings.fetch([
      'can_see_hellbanned',
      'clubs_mod_can_delete_topics',
      'clubs_mod_can_hard_delete_topics'
    ]);

    let postVisibleSt = [ N.models.clubs.Post.statuses.VISIBLE ];

    if (env.data.settings.can_see_hellbanned || env.user_info.hb) {
      postVisibleSt.push(N.models.clubs.Post.statuses.HB);
    }

    if (env.data.settings.clubs_mod_can_delete_topics) {
      postVisibleSt.push(N.models.clubs.Post.statuses.DELETED);
    }

    if (env.data.settings.clubs_mod_can_see_hard_deleted_topics) {
      postVisibleSt.push(N.models.clubs.Post.statuses.DELETED_HARD);
    }

    if (postVisibleSt.indexOf(env.data.post.st) === -1) throw N.io.NOT_FOUND;
  });


  // Using different sanitizer here,
  // because we need to expose editable fields (md) and don't need
  // autogenerated ones (bookmarks, views, html)
  //
  function sanitize_post(post) {
    // we can always hide HB status, because it doesn't affect client diffs
    if (post.st === N.models.clubs.Post.statuses.HB) {
      post = Object.assign({}, post);
      post.st = post.ste;
      delete post.ste;
    }

    if (post.prev_st && post.prev_st.st === N.models.clubs.Post.statuses.HB) {
      post.prev_st = Object.assign({}, post.prev_st);
      post.prev_st.st = post.prev_st.ste;
      delete post.prev_st.ste;
    }

    return _.pick(post, [
      'md',
      'st',
      'ste',
      'del_reason',
      'del_by',
      'prev_st'
    ]);
  }


  // Fetch and return post edit history
  //
  N.wire.on(apiPath, async function get_post_history(env) {
    let history = await N.models.clubs.PostHistory.find()
                            .where('post').equals(env.data.post._id)
                            .sort('_id')
                            .lean(true);

    let history_meta = [ {
      user: env.data.post.user,
      ts:   env.data.post.ts,
      role: N.models.clubs.PostHistory.roles.USER
    } ].concat(
      history.map(i => ({ user: i.user, ts: i.ts, role: i.role }))
    );

    let history_posts = history.map(x => x.post_data)
                         .concat([ env.data.post ])
                         .map(sanitize_post);

    env.res.history = [];

    for (let i = 0; i < history_posts.length; i++) {
      env.res.history.push({
        meta: history_meta[i],
        post: history_posts[i]
      });
    }

    env.data.users = (env.data.users || []).concat(env.res.history.map(x => x.meta.user));
  });
};
