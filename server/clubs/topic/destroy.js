// Remove topic by id
//
'use strict';


const _ = require('lodash');
const sanitize_topic = require('nodeca.clubs/lib/sanitizers/topic');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:    { type: 'integer', required: true },
    reason:       { type: 'string' },
    method:       { type: 'string', enum: [ 'hard', 'soft' ], required: true },
    as_moderator: { type: 'boolean', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    let statuses = N.models.clubs.Topic.statuses;
    let topic = await N.models.clubs.Topic.findOne({ hid: env.params.topic_hid }).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    if (topic.st === statuses.DELETED || topic.st === statuses.DELETED_HARD) {
      throw N.io.NOT_FOUND;
    }

    env.data.topic = topic;
  });


  // Fetch first post
  //
  N.wire.before(apiPath, async function fetch_post(env) {
    let post = await N.models.clubs.Post.findOne({ _id: env.data.topic.cache.first_post }).lean(true);

    if (!post) throw N.io.NOT_FOUND;

    env.data.post = post;
  });


  // Check if user has an access to this topic
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { topics: env.data.topic, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.topic', access_env);

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
    let topic = env.data.topic;

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

    // User can't hard delete topics
    if (env.params.method === 'hard') throw N.io.FORBIDDEN;

    // User can't delete topic with answers
    if (topic.cache.post_count !== 1 || topic.cache_hb.post_count !== 1) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_delete_topic_with_answers')
      };
    }

    // Check owner of first post in topic
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


  // Remove topic
  //
  N.wire.on(apiPath, async function delete_topic(env) {
    let statuses = N.models.clubs.Topic.statuses;

    let topic = env.data.topic;
    let update = {
      st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
      $unset: { ste: 1 },
      prev_st: _.pick(topic, [ 'st', 'ste' ]),
      del_by: env.user_info.user_id
    };

    if (env.params.reason) {
      update.del_reason = env.params.reason;
    }

    env.data.new_topic = await N.models.clubs.Topic.findOneAndUpdate(
      { _id: topic._id },
      update,
      { new: true }
    );
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.clubs.TopicHistory.add(
      {
        old_topic: env.data.topic,
        new_topic: env.data.new_topic
      },
      {
        user: env.user_info.user_id,
        role: N.models.clubs.TopicHistory.roles[env.params.as_moderator ? 'MODERATOR' : 'USER'],
        ip:   env.req.ip
      }
    );
  });


  // Change topic status in all posts
  //
  N.wire.after(apiPath, function change_topic_status_in_posts(env) {
    return N.models.clubs.Post.updateMany(
      { topic: env.data.topic._id },
      { $set: { topic_exists: false } }
    );
  });


  // Remove votes
  //
  N.wire.after(apiPath, async function remove_votes(env) {
    let st = N.models.clubs.Post.statuses;

    // IDs list can be very large for big topics, but this should work
    let posts = await N.models.clubs.Post.find({ topic: env.data.topic._id, st: { $in: [ st.VISIBLE, st.HB ] } })
      .select('_id')
      .lean(true);

    await N.models.users.Vote.updateMany(
      { for: { $in: posts.map(x => x._id) } },
      // Just move vote `value` field to `backup` field
      { $rename: { value: 'backup' } }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function update_search_index(env) {
    await N.queue.club_topics_search_update_with_posts([ env.data.topic._id ]).postpone();
  });


  // Update club counters
  //
  N.wire.after(apiPath, async function update_club(env) {
    await N.models.clubs.Club.updateCache(env.data.topic.club);
  });


  // Update user counters
  //
  N.wire.after(apiPath, async function update_user(env) {
    await N.models.clubs.UserTopicCount.recount(env.data.topic.cache.first_user);

    let users = (
      await N.models.clubs.Post.find()
                .where('topic').equals(env.data.topic._id)
                .select('user')
                .lean(true)
    ).map(x => x.user);

    await N.models.clubs.UserPostCount.recount([ ...new Set(users.map(String)) ]);
  });


  // Return changed topic info
  //
  N.wire.after(apiPath, async function return_topic(env) {
    let topic = await N.models.clubs.Topic.findById(env.data.topic._id).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.res.topic = await sanitize_topic(N, topic, env.user_info);
  });
};
