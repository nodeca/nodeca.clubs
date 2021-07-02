// Recount number of topics in clubs for a user
//
// Params:
//  - user_id (ObjectId)
//
// This internal method is used in `activity_update` task, so recount is
// delayed and performed in the background.
//
// It also may be used whenever we don't need delayed update
// (e.g. in seeds and vbconvert).
//

'use strict';


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function activity_fetch_club_topics({ user_id }) {
    // check that user exists
    let user = await N.models.users.User.findById(user_id).lean(true);
    if (!user) return;

    let counters_by_status = await Promise.all(
      N.models.clubs.Topic.statuses.LIST_VISIBLE.map(st =>
        N.models.clubs.Topic
            .where('cache.first_user').equals(user._id)
            .where('st').equals(st)
            .countDocuments()
      )
    );

    let results = counters_by_status.reduce((a, b) => a + b, 0);

    let results_hb = await N.models.clubs.Topic
                               .where('cache.first_user').equals(user._id)
                               .where('st').equals(N.models.clubs.Topic.statuses.HB)
                               .countDocuments();

    await N.models.clubs.UserTopicCount.replaceOne(
      { user: user._id },
      { user: user._id, value: results, value_hb: results + results_hb },
      { upsert: true }
    );
  });
};
