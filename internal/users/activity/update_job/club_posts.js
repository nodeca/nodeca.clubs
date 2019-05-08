// Recount number of posts in clubs for a user
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

  N.wire.on(apiPath, async function activity_fetch_club_posts({ user_id }) {
    // check that user exists
    let user = await N.models.users.User.findById(user_id).lean(true);
    if (!user) return;

    let results = await N.models.clubs.Post
                            .where('user').equals(user._id)
                            .where('st').equals(N.models.clubs.Post.statuses.VISIBLE)
                            .where('topic_exists').equals(true)
                            .countDocuments();

    let results_hb = await N.models.clubs.Post
                               .where('user').equals(user._id)
                               .where('st').equals(N.models.clubs.Post.statuses.HB)
                               .where('topic_exists').equals(true)
                               .countDocuments();

    await N.models.clubs.UserPostCount.replaceOne(
      { user: user._id },
      { user: user._id, value: results, value_hb: results + results_hb },
      { upsert: true }
    );
  });
};
