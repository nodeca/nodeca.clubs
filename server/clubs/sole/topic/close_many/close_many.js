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
    if (!env.data.is_club_owner) throw N.io.FORBIDDEN;
  });


  // Fetch topics
  //
  N.wire.before(apiPath, async function fetch_topics(env) {
    env.data.topics = await N.models.clubs.Topic.find()
                                .where('hid').in(env.params.topics_hids)
                                .where('club').equals(env.data.club._id)
                                .where('st').in(N.models.clubs.Topic.statuses.LIST_CLOSEBLE)
                                .select('_id st')
                                .lean(true);

    if (!env.data.topics.length) throw { code: N.io.CLIENT_ERROR, message: env.t('err_no_topics') };
  });


  // Close topics
  //
  N.wire.on(apiPath, async function close_topics(env) {
    let statuses = N.models.clubs.Topic.statuses;
    let bulk = N.models.clubs.Topic.collection.initializeUnorderedBulkOp();

    env.data.topics.forEach(topic => {
      let setData = {};

      if (topic.st === statuses.PINNED || topic.st === statuses.HB) {
        setData.ste = statuses.CLOSED;
      } else {
        setData.st = statuses.CLOSED;
      }

      bulk.find({ _id: topic._id }).updateOne({ $set: setData });
    });

    await bulk.execute();
  });


  // TODO: schedule search index update

  // TODO: log moderator actions
};
