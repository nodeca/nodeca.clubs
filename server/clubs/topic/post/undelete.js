// Undelete removed post by id
//
'use strict';


const _ = require('lodash');


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

    _.assign(update, post.prev_st);

    await N.models.clubs.Post.update({ _id: post._id }, update);
  });


  // Update topic counters
  //
  N.wire.after(apiPath, async function update_topic(env) {
    await N.models.clubs.Topic.updateCache(env.data.topic._id);
  });


  // Restore votes
  //
  N.wire.after(apiPath, async function restore_votes(env) {
    await N.models.users.Vote.collection.update(
      { 'for': env.data.post._id },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } },
      { multi: true }
    );
  });


  // TODO: schedule search index update

  // Update section counters
  //
  N.wire.after(apiPath, async function update_club(env) {
    await N.models.clubs.Club.updateCache(env.data.topic.club);
  });

  // TODO: log moderator actions
};
