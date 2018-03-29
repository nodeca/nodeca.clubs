// Undelete topic by id
//
'use strict';

const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    let topic = await N.models.clubs.Topic.findOne({ hid: env.params.topic_hid }).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
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

    let membership = await N.models.clubs.ClubMember.findOne()
                               .where('user').equals(env.user_info.user_id)
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    env.data.is_club_member = !!membership;
    env.data.is_club_owner  = !!membership && membership.is_owner;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let statuses = N.models.clubs.Topic.statuses;

    let settings = await env.extras.settings.fetch([
      'clubs_mod_can_delete_topics',
      'clubs_mod_can_see_hard_deleted_topics'
    ]);

    if (env.data.topic.st === statuses.DELETED && settings.clubs_mod_can_delete_topics) {
      return;
    }

    if (env.data.topic.st === statuses.DELETED_HARD && settings.clubs_mod_can_see_hard_deleted_topics) {
      return;
    }

    // We should not show, that topic exists if no permissions
    throw N.io.NOT_FOUND;
  });


  // Undelete topic
  //
  N.wire.on(apiPath, async function undelete_topic(env) {
    let topic = env.data.topic;

    let update = {
      $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
    };

    _.assign(update, topic.prev_st);

    env.res.topic = { st: update.st, ste: update.ste };

    await N.models.clubs.Topic.update({ _id: topic._id }, update);
  });


  // Restore votes
  //
  N.wire.after(apiPath, async function restore_votes(env) {
    let st = N.models.clubs.Post.statuses;

    // IDs list can be very large for big topics, but this should work
    let posts = await N.models.clubs.Post.find({ topic: env.data.topic._id, st: { $in: [ st.VISIBLE, st.HB ] } })
      .select('_id')
      .lean(true);

    await N.models.users.Vote.collection.update(
      { 'for': { $in: _.map(posts, '_id') } },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } },
      { multi: true }
    );
  });


  // TODO: schedule search index update

  // Update club counters
  //
  N.wire.after(apiPath, async function update_club(env) {
    await N.models.clubs.Club.updateCache(env.data.topic.club);
  });

  // TODO: log moderator actions
};
