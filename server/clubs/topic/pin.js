// Pin/unpin topic by hid
//

'use strict';


const sanitize_topic = require('nodeca.clubs/lib/sanitizers/topic');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid: { type: 'integer', required: true },
    unpin:     { type: 'boolean', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    let statuses = N.models.clubs.Topic.statuses;
    let query = { hid: env.params.topic_hid };

    if (env.params.unpin) {
      query.st = statuses.PINNED;
    } else {
      query.st = { $in: statuses.LIST_VISIBLE };
    }

    env.data.topic = await N.models.clubs.Topic
                              .findOne(query)
                              .lean(true);

    if (!env.data.topic) throw N.io.NOT_FOUND;
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
    env.data.is_club_owner  = !!membership && membership.is_owner;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let settings = await env.extras.settings.fetch([
      'clubs_lead_can_pin_topic',
      'clubs_mod_can_pin_topic'
    ]);

    // Permit pinning as club owner
    if (env.data.is_club_owner && settings.clubs_lead_can_pin_topic) return;

    // Permit pinning as global moderator
    if (settings.clubs_mod_can_pin_topic) return;

    throw N.io.FORBIDDEN;
  });


  // Pin/unpin topic
  //
  N.wire.on(apiPath, async function pin_topic(env) {
    let statuses = N.models.clubs.Topic.statuses;
    let topic = env.data.topic;

    // Pin topic
    if (!env.params.unpin) {
      env.data.new_topic = await N.models.clubs.Topic.findOneAndUpdate(
        { _id: topic._id },
        { st: statuses.PINNED, ste: topic.st },
        { new: true }
      );
      return;
    }

    // Unpin topic
    env.data.new_topic = await N.models.clubs.Topic.findOneAndUpdate(
      { _id: topic._id },
      { st: topic.ste, $unset: { ste: 1 } },
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
        role: N.models.clubs.TopicHistory.roles.MODERATOR,
        ip:   env.req.ip
      }
    );
  });


  // Return changed topic info
  //
  N.wire.after(apiPath, async function return_topic(env) {
    let topic = await N.models.clubs.Topic.findById(env.data.topic._id).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.res.topic = await sanitize_topic(N, topic, env.user_info);
  });
};
