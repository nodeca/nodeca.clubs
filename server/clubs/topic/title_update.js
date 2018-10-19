// Update topic title
//

'use strict';

const charcount = require('charcount');

// If same user edits the same post within 5 minutes, all changes
// made within that period will be squashed into one diff.
const HISTORY_GRACE_PERIOD = 5 * 60 * 1000;


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
    await N.models.clubs.Topic.update(
      { _id: env.data.topic._id },
      { title: env.params.title.trim() });
  });


  // Save old version in post history
  //
  // NOTE: code is the same as in forum.topic.post.update (changes marked)
  //
  N.wire.after(apiPath, async function save_post_history(env) {
    // post fetch differs in forum.topic.post.update
    let orig_post = await N.models.clubs.Post.findOne({
      topic: env.data.topic._id,
      hid:   1
    }).lean(true);
    let new_post = orig_post;

    if (!orig_post) return;

    let last_entry = await N.models.clubs.PostHistory.findOne({
      post: orig_post._id
    }).sort('-_id').lean(true);

    let last_update_time = last_entry ? last_entry.ts   : orig_post.ts;
    let last_update_user = last_entry ? last_entry.user : orig_post.user;
    let now = new Date();

    // if the same user edits the same post within grace period, history won't be changed
    if (!(last_update_time > now - HISTORY_GRACE_PERIOD &&
          last_update_time < now &&
          String(last_update_user) === String(env.user_info.user_id))) {

      /* eslint-disable no-undefined */
      last_entry = await new N.models.clubs.PostHistory({
        post:       orig_post._id,
        user:       env.user_info.user_id,
        md:         orig_post.md,
        tail:       orig_post.tail,
        title:      orig_post.hid <= 1 ? env.data.topic.title : undefined,
        params_ref: orig_post.params_ref,
        ip:         env.req.ip
      }).save();
    }

    // if the next history entry would be the same as the last one
    // (e.g. user saves post without changes or reverts change within 5 min),
    // remove redundant history entry
    if (last_entry) {
      let last_post_str = JSON.stringify({
        post:       last_entry.post,
        user:       last_entry.user,
        md:         last_entry.md,
        tail:       last_entry.tail,
        title:      last_entry.title,
        params_ref: last_entry.params_ref
      });

      let next_post_str = JSON.stringify({
        post:       new_post._id,
        user:       env.user_info.user_id,
        md:         new_post.md,
        tail:       new_post.tail,
        // title is calculated differently in forum.topic.post.update
        title:      env.params.title.trim(),
        params_ref: new_post.params_ref
      });

      if (last_post_str === next_post_str) {
        await N.models.clubs.PostHistory.remove({ _id: last_entry._id });
      }
    }

    await N.models.clubs.Post.update(
      { _id: orig_post._id },
      { $set: {
        last_edit_ts: new Date(),
        edit_count: await N.models.clubs.PostHistory.count({ post: orig_post._id })
      } }
    );
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function update_search_index(env) {
    await N.queue.club_topics_search_update_by_ids([ env.data.topic._id ]).postpone();
  });
};
