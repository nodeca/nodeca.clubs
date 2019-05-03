// Remove many topics by hid
//
'use strict';


const _ = require('lodash');


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
    club_hid: { type: 'integer', required: true },
    topics_hids: {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { type: 'integer', required: true }
    },
    reason: { type: 'string' },
    method: { type: 'string', 'enum': [ 'hard', 'soft' ], required: true }
  });


  // Fetch club info and membership
  //
  N.wire.before(apiPath, async function fetch_club_info(env) {
    let club = await N.models.clubs.Club.findOne()
                         .where('hid').equals(env.params.club_hid)
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


  // Check if user has an access to this club
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { clubs: env.data.club, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.club', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    // Check moderator permissions
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
  });


  // Fetch topics
  //
  N.wire.before(apiPath, async function fetch_topics(env) {
    env.data.topics = await N.models.clubs.Topic.find()
                                .where('hid').in(env.params.topics_hids)
                                .where('club').equals(env.data.club._id)
                                .where('st').in(N.models.clubs.Topic.statuses.LIST_DELETABLE)
                                .lean(true);

    if (!env.data.topics.length) throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_topics') };
  });


  // Remove topics
  //
  N.wire.on(apiPath, async function delete_topics(env) {
    env.data.changes = [];

    let statuses = N.models.clubs.Topic.statuses;
    let bulk = N.models.clubs.Topic.collection.initializeUnorderedBulkOp();

    env.data.topics.forEach(topic => {
      let setData = {
        st: env.params.method === 'hard' ? statuses.DELETED_HARD : statuses.DELETED,
        prev_st: _.pick(topic, [ 'st', 'ste' ]),
        del_by: env.user_info.user_id
      };

      if (env.params.reason) setData.del_reason = env.params.reason;

      let update = {
        $set: setData,
        $unset: { ste: 1 }
      };

      env.data.changes.push({
        old_topic: topic,
        new_topic: mongo_apply(topic, update)
      });

      bulk.find({ _id: topic._id }).updateOne(update);
    });

    await bulk.execute();
  });


  // Save old version in history
  //
  N.wire.after(apiPath, function save_history(env) {
    return N.models.clubs.TopicHistory.add(
      env.data.changes,
      {
        user: env.user_info.user_id,
        role: N.models.clubs.TopicHistory.roles.MODERATOR,
        ip:   env.req.ip
      }
    );
  });


  // Change topic status in all posts
  //
  N.wire.after(apiPath, function change_topic_status_in_posts(env) {
    return N.models.clubs.Post.updateMany(
      { topic: { $in: _.map(env.data.topics, '_id') } },
      { $set: { topic_exists: false } }
    );
  });


  // Remove votes
  //
  N.wire.after(apiPath, async function remove_votes(env) {
    let statuses = N.models.clubs.Post.statuses;

    // IDs list can be very large for big topics, but this should work
    let posts = await N.models.clubs.Post.find()
                          .where('topic').in(_.map(env.data.topics, '_id'))
                          .where('st').in([ statuses.VISIBLE, statuses.HB ])
                          .select('_id')
                          .lean(true);

    await N.models.users.Vote.updateMany(
      { 'for': { $in: _.map(posts, '_id') } },
      // Just move vote `value` field to `backup` field
      { $rename: { value: 'backup' } }
    );
  });


  // Update club counters
  //
  N.wire.after(apiPath, async function update_club(env) {
    await N.models.clubs.Club.updateCache(env.data.club._id);
  });


  // Update user topic counters
  //
  N.wire.after(apiPath, async function update_user_topics(env) {
    let users = _.map(env.data.topics, 'cache.first_user');

    await N.models.clubs.UserTopicCount.recount(_.uniq(users.map(String)));
  });


  // Update user post counters
  //
  N.wire.after(apiPath, async function update_user_topics(env) {
    let users = _.map(
      await N.models.clubs.Post.find()
                .where('topic').in(_.map(env.data.topics, '_id'))
                .select('user')
                .lean(true),
      'user'
    );

    await N.models.clubs.UserPostCount.recount(_.uniq(users.map(String)));
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function update_search_index(env) {
    await N.queue.club_topics_search_update_with_posts(env.data.topics.map(t => t._id)).postpone();
  });
};
