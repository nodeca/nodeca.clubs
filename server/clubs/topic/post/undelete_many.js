// Undelete removed posts by id
//
'use strict';


// apply $set and $unset operations on an object
function mongo_apply(object, ops) {
  let result = Object.assign({}, object);

  for (let [ k, v ]  of Object.entries(ops)) {
    if (k === '$set') {
      Object.assign(result, v);
      continue;
    }

    if (k === '$unset') {
      for (let delete_key of Object.keys(v)) {
        delete result[delete_key];
      }
      continue;
    }

    result[k] = v;
  }

  return result;
}


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', required: true },
    posts_ids: {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { format: 'mongo', required: true }
    }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    env.data.topic = await N.models.clubs.Topic.findOne({ hid: env.params.topic_hid }).lean(true);
    if (!env.data.topic) throw N.io.NOT_FOUND;
  });


  // Check if user has an access to this topic
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { topics: env.data.topic, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;

    // We can't delete first post. Topic operation should be requested instead
    env.params.posts_ids.forEach(postId => {
      if (String(env.data.topic.cache.first_post) === postId) {
        throw N.io.BAD_REQUEST;
      }
    });
  });


  // Fetch posts & check permissions
  //
  N.wire.before(apiPath, async function fetch_posts(env) {
    // Fetch moderator permissions
    let settings = await env.extras.settings.fetch([
      'clubs_mod_can_delete_topics',
      'clubs_mod_can_hard_delete_topics'
    ]);

    let st = [];

    if (settings.clubs_mod_can_delete_topics) {
      st.push(N.models.clubs.Post.statuses.DELETED);
    }

    if (settings.clubs_mod_can_hard_delete_topics) {
      st.push(N.models.clubs.Post.statuses.DELETED_HARD);
    }

    if (!st.length) {
      throw N.io.FORBIDDEN;
    }

    env.data.posts = await N.models.clubs.Post.find()
                              .where('_id').in(env.params.posts_ids)
                              .where('topic').equals(env.data.topic._id)
                              .where('st').in(st)
                              .lean(true);

    if (!env.data.posts.length) throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_posts') };
  });


  // Undelete posts
  //
  N.wire.on(apiPath, async function undelete_posts(env) {
    env.data.changes = [];

    let bulk = N.models.clubs.Post.collection.initializeUnorderedBulkOp();

    env.data.posts.forEach(post => {
      let update = {
        $set: post.prev_st,
        $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
      };

      env.data.changes.push({
        old_post: post,
        new_post: mongo_apply(post, update)
      });

      bulk.find({ _id: post._id }).updateOne(update);
    });

    await bulk.execute();
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.clubs.PostHistory.add(
      env.data.changes,
      {
        user: env.user_info.user_id,
        role: N.models.clubs.PostHistory.roles.MODERATOR,
        ip:   env.req.ip
      }
    );
  });


  // Restore votes
  //
  N.wire.after(apiPath, async function remove_votes(env) {
    await N.models.users.Vote.updateMany(
      { for: { $in: env.data.posts.map(x => x._id) } },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function update_search_index(env) {
    await N.queue.club_topics_search_update_by_ids([ env.data.topic._id ]).postpone();
    await N.queue.club_posts_search_update_by_ids(env.data.posts.map(p => p._id)).postpone();
  });


  // Update cache
  //
  N.wire.after(apiPath, async function update_cache(env) {
    await N.models.clubs.Topic.updateCache(env.data.topic._id);
    await N.models.clubs.Club.updateCache(env.data.topic.club);
  });


  // Update user counters
  //
  N.wire.after(apiPath, async function update_user(env) {
    let users = env.data.posts.map(x => x.user);

    await N.models.clubs.UserPostCount.recount([ ...new Set(users.map(String)) ]);
  });
};
