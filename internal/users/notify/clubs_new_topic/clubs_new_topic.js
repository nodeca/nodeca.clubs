// Deliver `CLUBS_NEW_TOPIC` notification
//
'use strict';


const _         = require('lodash');
const render    = require('nodeca.core/lib/system/render/common');
const user_info = require('nodeca.users/lib/user_info');


module.exports = function (N) {
  N.wire.on('internal:users.notify.deliver', async function notify_deliver_clubs_topic(local_env) {
    if (local_env.type !== 'CLUBS_NEW_TOPIC') return;

    let topic = await N.models.clubs.Topic.findById(local_env.src).lean(true);

    if (!topic) return;

    let post = await N.models.clubs.Post.findById(topic.cache.first_post).lean(true);

    if (!post) return;

    let club = await N.models.clubs.Club.findById(topic.club).lean(true);

    if (!club) return;

    // Fetch user info
    //
    let users_info = await user_info(N, local_env.to);

    // Filter topic owner (don't send notification to user who create this topic)
    //
    local_env.to = local_env.to.filter(user_id => String(user_id) !== String(post.user));

    // Filter users who are not watching this club
    //
    let Subscription = N.models.users.Subscription;

    let subscriptions = await Subscription.find()
                                .where('user').in(local_env.to)
                                .where('to').equals(club._id)
                                .where('type').equals(Subscription.types.WATCHING)
                                .lean(true);

    let watching = subscriptions.map(subscription => String(subscription.user));

    // Only if `user_id` in both arrays
    local_env.to = _.intersection(local_env.to, watching);

    // Filter users by access
    //
    await Promise.all(local_env.to.slice().map(user_id => {
      let access_env = { params: {
        posts: post,
        user_info: users_info[user_id],
        preload: [ topic ]
      } };

      return N.wire.emit('internal:clubs.access.post', access_env)
        .then(() => {
          if (!access_env.data.access_read) {
            local_env.to = _.without(local_env.to, user_id);
          }
        });
    }));

    // Render messages
    //
    let general_project_name = await N.settings.get('general_project_name');

    local_env.to.forEach(user_id => {
      let locale = users_info[user_id].locale || N.config.locales[0];
      let helpers = {};

      helpers.t = (phrase, params) => N.i18n.t(locale, phrase, params);
      helpers.t.exists = phrase => N.i18n.hasPhrase(locale, phrase);

      let subject = N.i18n.t(locale, 'users.notify.clubs_new_topic.subject', {
        project_name: general_project_name,
        club_title:   club.title
      });

      let url = N.router.linkTo('clubs.topic', {
        club_hid:  club.hid,
        topic_hid: topic.hid,
        post_hid:  post.hid
      });

      let unsubscribe = N.router.linkTo('clubs.sole.unsubscribe', {
        club_hid: club.hid
      });

      let text = render(N, 'users.notify.clubs_new_topic', { post_html: post.html, link: url }, helpers);

      local_env.messages[user_id] = { subject, text, url, unsubscribe };
    });
  });
};
