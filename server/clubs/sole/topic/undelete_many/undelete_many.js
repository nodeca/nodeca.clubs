// Remove many topics by hid
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid: { type: 'integer', required: true },
    topics_hids: {
      type: 'array',
      required: true,
      uniqueItems: true,
      items: { type: 'integer', required: true }
    }
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


  // Fetch topics & check permissions
  //
  N.wire.before(apiPath, async function fetch_topics(env) {
    // Fetch moderator permissions
    let settings = await env.extras.settings.fetch([
      'clubs_mod_can_delete_topics',
      'clubs_mod_can_hard_delete_topics'
    ]);

    let st = [];

    if (settings.clubs_mod_can_delete_topics) {
      st.push(N.models.clubs.Topic.statuses.DELETED);
    }

    if (settings.clubs_mod_can_hard_delete_topics) {
      st.push(N.models.clubs.Topic.statuses.DELETED_HARD);
    }

    if (!st.length) {
      throw N.io.FORBIDDEN;
    }

    env.data.topics = await N.models.clubs.Topic.find()
                                .where('hid').in(env.params.topics_hids)
                                .where('club').equals(env.data.club._id)
                                .where('st').in(st)
                                .select('_id prev_st')
                                .lean(true);

    if (!env.data.topics.length) throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_topics') };
  });


  // Undelete topics
  //
  N.wire.on(apiPath, async function undelete_topics(env) {
    let bulk = N.models.clubs.Topic.collection.initializeUnorderedBulkOp();

    env.data.topics.forEach(topic => {
      bulk.find({ _id: topic._id }).updateOne({
        $set: topic.prev_st,
        $unset: { del_reason: 1, prev_st: 1, del_by: 1 }
      });
    });

    await bulk.execute();
  });


  // Restore votes
  //
  N.wire.after(apiPath, async function remove_votes(env) {
    let statuses = N.models.clubs.Post.statuses;

    // IDs list can be very large for big topics, but this should work
    let posts = await N.models.clubs.Post.find()
                          .where('topic').in(_.map(env.data.topics, '_id'))
                          .where('st').in([ statuses.VISIBLE, statuses.HB ])
                          .select('_id')
                          .lean(true);

    await N.models.users.Vote.collection.update(
      { 'for': { $in: _.map(posts, '_id') } },
      // Just move vote `backup` field back to `value` field
      { $rename: { backup: 'value' } },
      { multi: true }
    );
  });


  // Update club counters
  //
  N.wire.after(apiPath, async function update_club(env) {
    await N.models.clubs.Club.updateCache(env.data.club._id);
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function update_search_index(env) {
    await N.queue.club_topics_search_update_with_posts(env.data.topics.map(t => t._id)).postpone();
  });

  // TODO: log moderator actions
};
