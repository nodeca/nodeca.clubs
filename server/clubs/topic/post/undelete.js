// Undelete removed post by id
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true }
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
    let topic = await N.models.clubs.Topic.findById(env.data.post.topic).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let statuses = N.models.clubs.Post.statuses;

    // We can't undelete first port. Topic operation should be requested instead
    if (String(env.data.topic.cache.first_post) === String(env.data.post._id)) {
      throw N.io.FORBIDDEN;
    }

    let settings = await env.extras.settings.fetch([
      'clubs_mod_can_delete_topics',
      'clubs_mod_can_see_hard_deleted_topics'
    ]);

    if (env.data.post.st === statuses.DELETED && settings.clubs_mod_can_delete_topics) {
      return;
    }

    if (env.data.post.st === statuses.DELETED_HARD && settings.clubs_mod_can_see_hard_deleted_topics) {
      return;
    }

    // We should not show, that topic exists if no permissions
    throw N.io.NOT_FOUND;
  });


  // Undelete post
  //
  N.wire.on(apiPath, async function undelete_post(env) {
    let post = env.data.post;

    let update = {
      $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
    };

    Object.assign(update, post.prev_st);

    env.data.new_post = await N.models.clubs.Post.findOneAndUpdate(
      { _id: post._id },
      update,
      { new: true }
    );
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.clubs.PostHistory.add(
      {
        old_post: env.data.post,
        new_post: env.data.new_post
      },
      {
        user: env.user_info.user_id,
        role: N.models.clubs.PostHistory.roles.MODERATOR,
        ip:   env.req.ip
      }
    );
  });


  // Update topic counters
  //
  N.wire.after(apiPath, async function update_topic(env) {
    await N.models.clubs.Topic.updateCache(env.data.topic._id);
  });


  // Restore votes
  //
  N.wire.after(apiPath, async function restore_votes(env) {
    await N.models.users.Vote.updateMany(
      { for: env.data.post._id },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function update_search_index(env) {
    await N.queue.club_topics_search_update_by_ids([ env.data.topic._id ]).postpone();
    await N.queue.club_posts_search_update_by_ids([ env.data.post._id ]).postpone();
  });


  // Update club counters
  //
  N.wire.after(apiPath, async function update_club(env) {
    await N.models.clubs.Club.updateCache(env.data.topic.club);
  });


  // Update user counters
  //
  N.wire.after(apiPath, async function update_user(env) {
    await N.models.clubs.UserPostCount.recount(env.data.post.user);
  });
};
