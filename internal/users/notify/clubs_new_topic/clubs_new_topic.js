// Deliver `CLUBS_NEW_TOPIC` notification
//
'use strict';


const render    = require('nodeca.core/lib/system/render/common');
const user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  // Notification will not be sent if target user:
  //
  // 1. creates this topic himself
  // 2. no longer has access to this club
  // 3. ignores sender of this message
  //
  N.wire.on('internal:users.notify.deliver', async function notify_deliver_clubs_topic(local_env) {
    if (local_env.type !== 'CLUBS_NEW_TOPIC') return;

    // Fetch topic
    //
    let topic = await N.models.clubs.Topic.findById(local_env.src).lean(true);
    if (!topic) return;

    // Fetch post
    //
    let post = await N.models.clubs.Post.findById(topic.cache.first_post).lean(true);
    if (!post) return;

    // Fetch club
    //
    let club = await N.models.clubs.Club.findById(topic.club).lean(true);
    if (!club) return;

    let from_user_id = String(post.user);

    // Get list of subscribed users
    //
    let subscriptions = await N.models.users.Subscription.find()
                                  .where('to').equals(club._id)
                                  .where('type').equals(N.models.users.Subscription.types.WATCHING)
                                  .lean(true);

    if (!subscriptions.length) return;

    let user_ids = new Set(subscriptions.map(subscription => String(subscription.user)));

    // Apply ignores (list of users who already received this notification earlier)
    for (let user_id of local_env.ignore || []) user_ids.delete(user_id);

    // Fetch user info
    let users_info = await user_info(N, Array.from(user_ids));

    // 1. filter topic owner (don't send notification to user who create this topic)
    //
    user_ids.delete(from_user_id);

    // 2. filter users by access
    //
    for (let user_id of user_ids) {
      let access_env = { params: {
        posts: post,
        user_info: users_info[user_id],
        preload: [ topic, club ]
      } };

      await N.wire.emit('internal:clubs.access.post', access_env);

      if (!access_env.data.access_read) user_ids.delete(user_id);
    }

    // 3. filter out ignored users
    //
    let ignore_data = await N.models.users.Ignore.find()
                                .where('from').in(Array.from(user_ids))
                                .where('to').equals(from_user_id)
                                .select('from to -_id')
                                .lean(true);

    for (let ignore of ignore_data) {
      user_ids.delete(String(ignore.from));
    }

    // Render messages
    //
    let general_project_name = await N.settings.get('general_project_name');

    for (let user_id of user_ids) {
      let locale = users_info[user_id].locale || N.config.locales[0];
      let helpers = {};

      helpers.t = (phrase, params) => N.i18n.t(locale, phrase, params);
      helpers.t.exists = phrase => N.i18n.hasPhrase(locale, phrase);
      helpers.asset_body = path => N.assets.asset_body(path);

      let subject = N.i18n.t(locale, 'users.notify.clubs_new_topic.subject', {
        project_name: general_project_name,
        club_title: club.title
      });

      let url = N.router.linkTo('clubs.topic', {
        club_hid: club.hid,
        topic_hid: topic.hid,
        post_hid: post.hid
      });

      let unsubscribe = N.router.linkTo('clubs.sole.unsubscribe', {
        club_hid: club.hid
      });

      let text = render(N, 'users.notify.clubs_new_topic', {
        title: topic.title,
        post_html: post.html,
        url,
        unsubscribe
      }, helpers);

      local_env.messages[user_id] = { subject, text };
    }
  });
};
