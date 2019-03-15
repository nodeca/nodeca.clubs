// Update topic title
//

'use strict';

const charcount = require('charcount');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:        { type: 'integer', required: true },
    title:            { type: 'string', minLength: 1, required: true },
    as_moderator:     { type: 'boolean', required: true }
  });


  // Check title length
  //
  N.wire.before(apiPath, async function check_title_length(env) {
    let min_length = await env.extras.settings.fetch('clubs_topic_title_min_length');

    if (charcount(env.params.title.trim()) < min_length) {
      // Real check is done on the client, no need to care about details here
      throw N.io.BAD_REQUEST;
    }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    let statuses = N.models.clubs.Topic.statuses;

    let topic = await N.models.clubs.Topic
                          .findOne({ hid: env.params.topic_hid })
                          .lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    // Can edit titles only in opened topics
    if (topic.st !== statuses.OPEN && topic.ste !== statuses.OPEN) {
      throw N.io.NOT_FOUND;
    }

    env.data.topic = topic;
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
    env.data.is_club_owner  = !!membership && membership.is_owner;
  });


  // Check if user can view this topic
  //
  N.wire.before(apiPath, async function check_access(env) {
    var access_env = { params: { topics: env.data.topic, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.topic', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let settings = await env.extras.settings.fetch([ 'clubs_lead_can_edit_titles', 'clubs_mod_can_edit_titles' ]);

    // check moderator permissions
    if (env.params.as_moderator) {
      if (settings.clubs_mod_can_edit_titles) return;
      if (env.data.is_club_owner && settings.clubs_lead_can_edit_titles) return;

      throw N.io.FORBIDDEN;
    }

    // check permissions for editing title as user
    if (env.user_info.user_id !== String(env.data.topic.cache.first_user)) {
      throw N.io.FORBIDDEN;
    }

    let clubs_edit_max_time = await env.extras.settings.fetch('clubs_edit_max_time');

    // Check that topic was created no more than 30 minutes ago
    if (clubs_edit_max_time !== 0 && env.data.topic.cache.first_ts < Date.now() - clubs_edit_max_time * 60 * 1000) {
      throw N.io.FORBIDDEN;
    }

    // check if user is a member of the club, maybe he quit or got kicked
    // after posting this message
    if (!env.data.is_club_member) {
      throw N.io.FORBIDDEN;
    }

    // check if user has permission to reply, maybe he was banned after posting
    let can_reply = await env.extras.settings.fetch('clubs_can_reply');

    if (!can_reply) throw N.io.FORBIDDEN;
  });


  // Update topic title
  //
  N.wire.on(apiPath, async function update_topic(env) {
    env.data.new_topic = await N.models.clubs.Topic.findOneAndUpdate(
      { _id: env.data.topic._id },
      { title: env.params.title.trim() },
      { 'new': true }
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


  // Schedule search index update
  //
  N.wire.after(apiPath, async function update_search_index(env) {
    await N.queue.club_topics_search_update_by_ids([ env.data.topic._id ]).postpone();
  });
};
