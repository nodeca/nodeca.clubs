// Close/open topic
//

'use strict';


const sanitize_topic = require('nodeca.clubs/lib/sanitizers/topic');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    topic_hid:    { type: 'integer', required: true },
    reopen:       { type: 'boolean', required: true },
    as_moderator: { type: 'boolean', required: true }
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    env.data.topic = await N.models.clubs.Topic
                              .findOne({ hid: env.params.topic_hid })
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
      'clubs_can_close_topic',
      'clubs_lead_can_close_topic',
      'clubs_mod_can_close_topic'
    ]);

    // Permit open/close as club owner
    if (env.data.is_club_owner && settings.clubs_lead_can_close_topic && env.params.as_moderator) {
      return;
    }

    // Permit open/close as global moderator
    if (settings.clubs_mod_can_close_topic && env.params.as_moderator) {
      return;
    }

    // Permit open/close as topic starter
    if (env.user_info.user_id === String(env.data.topic.cache.first_user) && settings.clubs_can_close_topic) {
      return;
    }

    throw N.io.FORBIDDEN;
  });


  // Update topic status
  //
  N.wire.on(apiPath, async function update_topic(env) {
    let statuses = N.models.clubs.Topic.statuses;
    let topic = env.data.topic;
    let update;
    let newStatus = env.params.reopen ? statuses.OPEN : statuses.CLOSED;

    if (topic.st === statuses.PINNED || topic.st === statuses.HB) {
      update = { ste: newStatus };
    } else {
      update = { st: newStatus };
    }

    let res = { st: update.st || topic.st, ste: update.ste || topic.ste };

    // Show `ste` instead `st` for hellbanned users in hellbanned topic
    if (env.user_info.hb && res.st === statuses.HB && !env.data.can_see_hellbanned) {
      res.st = res.ste;
      delete res.ste;
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


  // Return changed topic info
  //
  N.wire.after(apiPath, async function return_topic(env) {
    let topic = await N.models.clubs.Topic.findById(env.data.topic._id).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.res.topic = await sanitize_topic(N, topic, env.user_info);
  });
};
