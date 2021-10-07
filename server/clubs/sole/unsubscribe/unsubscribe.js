// Update subscription type and show unsubscribe club page
//
// `WATCHING|TRACKING -> NORMAL`
//
'use strict';


const sanitize_club = require('nodeca.clubs/lib/sanitizers/club');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid: { type: 'integer', required: true }
  });


  // Redirect guests to login page
  //
  N.wire.before(apiPath, async function force_login_guest(env) {
    await N.wire.emit('internal:users.force_login_guest', env);
  });


  // Fetch club
  //
  N.wire.before(apiPath, async function fetch_club(env) {
    let club = await N.models.clubs.Club.findOne()
                         .where('hid').equals(env.params.club_hid)
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;
  });


  // Check if user has an access to this club
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { clubs: env.data.club, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.club', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Fetch subscription
  //
  N.wire.before(apiPath, async function fetch_subscription(env) {
    env.data.subscription = await N.models.users.Subscription.findOne()
                                      .where('user').equals(env.user_info.user_id)
                                      .where('to').equals(env.data.club._id)
                                      .lean(true);
  });


  // Update subscription type
  //
  N.wire.on(apiPath, async function update_subscription_type(env) {
    // Shortcut
    let Subscription = N.models.users.Subscription;

    let curType = env.data.subscription ? env.data.subscription.type : Subscription.types.NORMAL;
    let updatedType;

    if ([ Subscription.types.WATCHING, Subscription.types.TRACKING ].indexOf(curType) !== -1) {
      // `WATCHING|TRACKING -> NORMAL`
      updatedType = Subscription.types.NORMAL;
    } else {
      // Nothing to update here, just fill subscription type
      env.res.subscription = curType;
      return;
    }

    // Fill subscription type
    env.res.subscription = updatedType;

    // Update with `upsert` to avoid duplicates
    await Subscription.updateOne(
      { user: env.user_info.user_id, to: env.data.club._id },
      { type: updatedType, to_type: N.shared.content_type.CLUB_SOLE },
      { upsert: true }
    );
  });


  // Fill club
  //
  N.wire.after(apiPath, async function fill_club(env) {
    env.res.club = await sanitize_club(N, env.data.club, env.user_info);
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_meta(env) {
    env.res.head = env.res.head || {};

    env.res.head.title = env.t('title');
  });
};
