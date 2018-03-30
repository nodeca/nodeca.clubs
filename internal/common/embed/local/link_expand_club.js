// Replace link to club with its title
//

'use strict';


const render = require('nodeca.core/lib/system/render/common');


module.exports = function (N) {

  N.wire.on('internal:common.embed.local', async function embed_club(data) {
    if (data.html) return;

    if (data.type !== 'inline') return;

    let match = N.router.matchAll(data.url).reduce((acc, match) => {
      if (match.meta.methods.get === 'clubs.sole') return match;
      return acc;
    }, null);

    if (!match) return;

    let club = await N.models.clubs.Club
                            .findOne({ hid: match.params.club_hid })
                            .lean(true);
    if (club) {
      data.html = render(N, 'common.blocks.markup.club_link', {
        href:    data.url,
        content: club.title
      }, {});
    }
  });
};
