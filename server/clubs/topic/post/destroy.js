// Remove post by id
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id:      { format: 'mongo', required: true },
    reason:       { type: 'string' },
    method:       { type: 'string', enum: [ 'hard', 'soft' ], required: true },
    as_moderator: { type: 'boolean', required: true }
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


  // Check if user can see this post
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      posts: env.data.post,
      user_info: env.user_info,
      preload: [ env.data.topic ]
    } };

    await N.wire.emit('internal:clubs.access.post', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Fetch club info and membership
  //
  N.wire.before(apiPath, async function fetch_club_info(env) {
    let club = await N.models.clubs.Club.findById(env.data.topic.club)
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;

    let membership = await N.models.clubs.Membership.findOne()
                               .where('user').equals(env.user_info.user_id)
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    env.data.is_club_member = !!membership;
    env.data.is_club_owner  = !!membership?.is_owner;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    // We can't delete first port. Topic operation should be requested instead
    if (String(env.data.topic.cache.first_post) === String(env.data.post._id)) {
      throw N.io.NOT_FOUND;
    }

    // Check moderator permissions

    if (env.params.as_moderator) {
      let settings = await env.extras.settings.fetch([
        'clubs_lead_can_delete_topics',
        'clubs_mod_can_delete_topics',
        'clubs_mod_can_hard_delete_topics'
      ]);

      if (env.params.method === 'soft') {
        if (settings.clubs_mod_can_delete_topics) return;
        if (env.data.is_club_owner && settings.clubs_lead_can_delete_topics) return;
      }

      if (env.params.method === 'hard') {
        if (settings.clubs_mod_can_hard_delete_topics) return;
      }

      throw N.io.FORBIDDEN;
    }

    // Check user permissions

    // User can't hard delete posts
    if (env.params.method === 'hard') throw N.io.FORBIDDEN;

    // Check post owner
    if (env.user_info.user_id !== String(env.data.post.user)) {
      throw N.io.FORBIDDEN;
    }

    let clubs_edit_max_time = await env.extras.settings.fetch('clubs_edit_max_time');

    if (clubs_edit_max_time !== 0 && env.data.post.ts < Date.now() - clubs_edit_max_time * 60 * 1000) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_perm_expired')
      };
    }
  });


  // Remove post
  //
  N.wire.on(apiPath, async function delete_post(env) {
    let statuses = N.models.clubs.Post.statuses;
    let post = env.data.post;
    let update = {
      st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
      $unset: { ste: 1 },
      prev_st: _.pick(post, [ 'st', 'ste' ]),
      del_by: env.user_info.user_id
    };

    if (env.params.reason) {
      update.del_reason = env.params.reason;
    }

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
        role: N.models.clubs.PostHistory.roles[env.params.as_moderator ? 'MODERATOR' : 'USER'],
        ip:   env.req.ip
      }
    );
  });


  // Update topic counters
  //
  N.wire.after(apiPath, async function update_topic(env) {
    await N.models.clubs.Topic.updateCache(env.data.topic._id);
  });


  // Remove votes
  //
  N.wire.after(apiPath, async function remove_votes(env) {
    await N.models.users.Vote.updateMany(
      { for: env.data.post._id },
      // Just move vote `value` field to `backup` field
      { $rename: { value: 'backup' } }
    );
  });


  // Increment topic version to invalidate old post count cache
  //
  N.wire.after(apiPath, async function remove_old_post_count_cache(env) {
    await N.models.clubs.Topic.updateOne({ _id: env.data.topic._id }, { $inc: { version: 1 } });
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
