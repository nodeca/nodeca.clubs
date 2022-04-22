// Collect urls to include in sitemap
//

'use strict';

const stream   = require('stream');
const multi    = require('multistream');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function get_clubs_sitemap(data) {
    let posts_per_page = await N.settings.get('posts_per_page');

    let clubs = await N.models.clubs.Club.find().sort('hid').lean(true);

    let clubs_by_id = {};

    for (let club of clubs) clubs_by_id[club._id] = club;

    let buffer = [];

    buffer.push({ loc: N.router.linkTo('clubs.index', {}), lastmod: new Date() });

    for (let club of clubs) {
      buffer.push({
        loc: N.router.linkTo('clubs.sole', {
          club_hid: club.hid
        }),
        lastmod: club.cache.last_ts
      });
    }

    let club_stream = stream.Readable.from(buffer);

    let topic_stream = new stream.Transform({
      objectMode: true,
      transform(topic, encoding, callback) {
        let pages = Math.ceil(topic.cache.post_count / posts_per_page);

        for (let page = 1; page <= pages; page++) {
          this.push({
            loc: N.router.linkTo('clubs.topic', {
              club_hid:  clubs_by_id[topic.club].hid,
              topic_hid: topic.hid,
              page
            }),
            lastmod: topic.cache.last_ts
          });
        }

        callback();
      }
    });

    stream.pipeline(
      N.models.clubs.Topic.find()
          .where('st').in(N.models.clubs.Topic.statuses.LIST_VISIBLE)
          .select('club hid cache.post_count cache.last_ts')
          .sort('hid')
          .lean(true)
          .cursor(),

      topic_stream,
      () => {}
    );

    data.streams.push({
      name: 'clubs',
      stream: multi.obj([ club_stream, topic_stream ])
    });
  });
};
