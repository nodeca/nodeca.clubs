// Fill urls and titles for club posts (`CLUB_POST`)
//
// In:
//
// - infractions ([users.Infraction])
// - user_info (Object)
//
// Out:
//
// - info (Object) - key is `src`, value { url, title, text }
//
'use strict';


const _ = require('lodash');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function club_posts_fetch_infraction_info(info_env) {
    let posts_ids = info_env.infractions.filter(i => i.src_type === N.shared.content_type.CLUB_POST)
                                        .map(x => x.src);
    if (!posts_ids.length) return;


    // Fetch posts
    //
    let posts = await N.models.clubs.Post.find()
                          .where('_id').in(posts_ids)
                          .lean(true);

    // Fetch topics
    //
    let topics = await N.models.clubs.Topic.find()
                           .where('_id').in(posts.map(x => x.topic))
                           .lean(true);

    // Fetch clubs
    //
    let clubs = await N.models.clubs.Club.find()
                          .where('_id').in(topics.map(x => x.club))
                          .lean(true);

    // Check permissions to see posts
    //
    let access_env = { params: {
      posts,
      user_info: info_env.user_info,
      preload: [].concat(topics).concat(clubs)
    } };

    await N.wire.emit('internal:clubs.access.post', access_env);

    posts = posts.filter((__, idx) => access_env.data.access_read[idx]);

    let topics_by_id = _.keyBy(topics, '_id');
    let clubs_by_id  = _.keyBy(clubs, '_id');

    posts.forEach(post => {
      let topic = topics_by_id[post.topic];
      let club  = clubs_by_id[topic.club];

      info_env.info[post._id] = {
        title: topic.title,
        url: N.router.linkTo('clubs.topic', {
          club_hid:  club.hid,
          topic_hid: topic.hid,
          post_hid:  post.hid
        }),
        text: post.md
      };
    });
  });
};
