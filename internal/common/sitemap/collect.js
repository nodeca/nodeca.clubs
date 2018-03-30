// Collect urls to include in sitemap
//

'use strict';

const from2    = require('from2');
const multi    = require('multistream');
const pumpify  = require('pumpify');
const through2 = require('through2');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function get_clubs_sitemap(data) {
    let posts_per_page = await N.settings.get('posts_per_page');

    let clubs = await N.models.clubs.Club.find().sort('hid').lean(true);

    let clubs_by_id = {};

    clubs.forEach(club => { clubs_by_id[club._id] = club; });

    let buffer = [];

    buffer.push({ loc: N.router.linkTo('clubs.index', {}), lastmod: new Date() });

    clubs.forEach(club => {
      buffer.push({
        loc: N.router.linkTo('clubs.sole', {
          club_hid: club.hid
        }),
        lastmod: club.cache.last_ts
      });
    });

    let topic_stream = pumpify.obj(
      N.models.clubs.Topic.collection.find({
        st: { $in: N.models.clubs.Topic.statuses.LIST_VISIBLE }
      }, {
        club:               1,
        hid:                1,
        'cache.post_count': 1,
        'cache.last_ts':    1
      }).sort({ hid: 1 }).stream(),

      through2.obj(function (topic, encoding, callback) {
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
      })
    );

    data.streams.push({
      name: 'clubs',
      stream: multi.obj([ from2.obj(buffer), topic_stream ])
    });
  });
};
