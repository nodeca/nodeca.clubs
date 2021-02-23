// Start resolving location name for a given club
//
// In:
//  - redis zset `geo:club` (`club_id:locale` => timestamp)
//

'use strict';


// time delay before location resolution, used to prevent multiple requests
// caused by "submit" button spam
const RESOLVE_DELAY = 5000;


module.exports = function (N) {
  N.wire.on('init:jobs', function register_geo_club_location_process() {
    N.queue.registerTask({
      name: 'geo_club_location_process',

      postponeDelay: RESOLVE_DELAY,

      async process() {
        let range_end = Date.now() - RESOLVE_DELAY;

        // data format: `club_id:locale`
        let res = await N.redis.multi()
                            .zrangebyscore('geo:club', '-inf', range_end)
                            .zremrangebyscore('geo:club', '-inf', range_end)
                            .exec();

        for (let clubid_locale of res[0][1]) {
          let [ club_id, locale ] = clubid_locale.split(':', 2);

          let club = await N.models.clubs.Club.findById(club_id).lean(true);

          if (!club || !club.location) continue;

          // request location names, triggering name resolution;
          // `true` means high priority
          await N.models.core.Location.info([ club.location ], locale, true);
        }
      }
    });
  });
};
