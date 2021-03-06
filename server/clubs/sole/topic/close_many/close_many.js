// Close topics
//
'use strict';


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
    env.data.is_club_owner  = !!membership?.is_owner;
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
    let settings = await env.extras.settings.fetch([ 'clubs_lead_can_close_topic', 'clubs_mod_can_close_topic' ]);

    if (settings.clubs_mod_can_close_topic) return;

    if (env.data.is_club_owner && settings.clubs_lead_can_close_topic) return;

    throw N.io.FORBIDDEN;
  });


  // Fetch topics
  //
  N.wire.before(apiPath, async function fetch_topics(env) {
    env.data.topics = await N.models.clubs.Topic.find()
                                .where('hid').in(env.params.topics_hids)
                                .where('club').equals(env.data.club._id)
                                .where('st').in(N.models.clubs.Topic.statuses.LIST_CLOSEBLE)
                                .lean(true);

    if (!env.data.topics.length) throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_topics') };
  });


  // Close topics
  //
  N.wire.on(apiPath, async function close_topics(env) {
    env.data.changes = [];

    let statuses = N.models.clubs.Topic.statuses;
    let bulk = N.models.clubs.Topic.collection.initializeUnorderedBulkOp();

    env.data.topics.forEach(topic => {
      let setData = {};

      if (topic.st === statuses.PINNED || topic.st === statuses.HB) {
        setData.ste = statuses.CLOSED;
      } else {
        setData.st = statuses.CLOSED;
      }

      env.data.changes.push({
        old_topic: topic,
        new_topic: Object.assign({}, topic, setData)
      });

      bulk.find({ _id: topic._id }).updateOne({ $set: setData });
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


  // Schedule search index update
  //
  N.wire.after(apiPath, async function update_search_index(env) {
    await N.queue.club_topics_search_update_with_posts(env.data.topics.map(t => t._id)).postpone();
  });
};
