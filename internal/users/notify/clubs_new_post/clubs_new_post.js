// Deliver `CLUBS_NEW_POST` notification
//
'use strict';


const render    = require('nodeca.core/lib/system/render/common');
const user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {

  // Notification will not be sent if target user:
  //
  // 1. creates post himself
  // 2. not watching this topic
  // 3. no longer has access to this topic
  // 4. ignores sender of this post
  //
  N.wire.on('internal:users.notify.deliver', async function notify_deliver_clubs_post(local_env) {
    if (local_env.type !== 'CLUBS_NEW_POST') return;

    let post = await N.models.clubs.Post.findById(local_env.src).lean(true);

    if (!post) return;

    let topic = await N.models.clubs.Topic.findById(post.topic).lean(true);

    if (!topic) return;

    let club = await N.models.clubs.Club.findById(topic.club).lean(true);

    if (!club) return;

    // Fetch user info
    //
    let users_info = await user_info(N, local_env.to);

    // 1. filter post owner (don't send notification to user who create this post)
    //
    local_env.to = local_env.to.filter(user_id => String(user_id) !== String(post.user));

    // 2. filter users who are not watching this topic
    //
    let Subscription = N.models.users.Subscription;

    let subscriptions = await Subscription.find()
                                .where('user').in(local_env.to)
                                .where('to').equals(topic._id)
                                .where('type').equals(Subscription.types.WATCHING)
                                .lean(true);

    let watching = new Set(subscriptions.map(subscription => String(subscription.user)));

    local_env.to = local_env.to.filter(user_id => watching.has(String(user_id)));

    // 3. filter users by access
    //
    await Promise.all(local_env.to.slice().map(user_id => {
      let access_env = { params: {
        posts: post,
        user_info: users_info[user_id],
        preload: [ topic, club ]
      } };

      return N.wire.emit('internal:clubs.access.post', access_env)
        .then(() => {
          if (!access_env.data.access_read) {
            local_env.to = local_env.to.filter(x => x !== user_id);
          }
        });
    }));

    // 4. filter out ignored users
    //
    let ignore_data = await N.models.users.Ignore.find()
                                .where('from').in(local_env.to)
                                .where('to').equals(post.user)
                                .select('from to -_id')
                                .lean(true);

    let ignored = new Set(ignore_data.map(x => String(x.from)));

    local_env.to = local_env.to.filter(user_id => !ignored.has(String(user_id)));

    // Render messages
    //
    let general_project_name = await N.settings.get('general_project_name');

    local_env.to.forEach(user_id => {
      let locale = users_info[user_id].locale || N.config.locales[0];
      let helpers = {};

      helpers.t = (phrase, params) => N.i18n.t(locale, phrase, params);
      helpers.t.exists = phrase => N.i18n.hasPhrase(locale, phrase);

      let subject = N.i18n.t(locale, 'users.notify.clubs_new_post.subject', {
        project_name: general_project_name,
        topic_title: topic.title
      });

      let url = N.router.linkTo('clubs.topic', {
        club_hid:  club.hid,
        topic_hid: topic.hid,
        post_hid:  post.hid
      });

      let unsubscribe = N.router.linkTo('clubs.topic.unsubscribe', {
        club_hid:  club.hid,
        topic_hid: topic.hid
      });

      let text = render(N, 'users.notify.clubs_new_post', { post_html: post.html, link: url }, helpers);

      local_env.messages[user_id] = { subject, text, url, unsubscribe };
    });
  });
};
