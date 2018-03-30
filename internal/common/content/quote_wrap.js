// Generate a quote wrapper for club posts
//

'use strict';


const render = require('nodeca.core/lib/system/render/common');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function generate_quote_wrapper(data) {
    if (data.html) return;

    let match = N.router.matchAll(data.url).reduce(function (acc, match) {
      return match.meta.methods.get === 'clubs.topic' && match.params.post_hid ? match : acc;
    }, null);

    if (!match) return;

    let topic = await N.models.clubs.Topic
                          .findOne({ hid: match.params.topic_hid })
                          .lean(true);
    if (!topic) return;

    let post = await N.models.clubs.Post
                        .findOne({ topic: topic._id, hid: match.params.post_hid })
                        .lean(true);
    if (!post) return;

    let user = await N.models.users.User
                        .findOne({ _id: post.user, exists: true })
                        .lean(true);

    let locals = {
      href:   N.router.linkTo('clubs.topic', match.params),
      topic, post, user
    };

    data.html = render(N, 'common.blocks.markup.quote', locals, {});
  });
};
