// Club search placeholder page, shows search input only;
// it doesn't return any results to prevent heavy load from bots
//

'use strict';


const sort_types   = [ 'date', 'rel' ];
const period_types = [ '0', '7', '30', '365' ];


module.exports = function (N, apiPath) {
  N.validate(apiPath, {
    $query: {
      type: 'object',
      required: true,
      properties: {
        hid:     { format: 'pos_int_str', required: true },
        query:   { type: 'string' },
        type:    { type: 'string' },
        sort:    { enum: sort_types },
        period:  { enum: period_types }
      }
    }
  });


  // Fetch club
  //
  N.wire.before(apiPath, async function fetch_club(env) {
    let club = await N.models.clubs.Club
                         .findOne({ hid: Number(env.params.$query.hid) })
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;
  });


  // Check if user can view this club
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { clubs: env.data.club, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.club', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  N.wire.on(apiPath, function search_club(env) {
    let menu = N.config.search?.club_sole?.menu || {};
    let content_types = Object.keys(menu)
                         .sort((a, b) => (menu[a].priority ?? 100) - (menu[b].priority ?? 100));
    let type = env.params.$query.type || content_types[0];

    env.res.head.title = env.t('title');
    env.res.head.robots = 'noindex,nofollow';

    // validate content type
    if (env.params.$query.type && content_types.indexOf(env.params.$query.type) === -1) {
      throw N.io.BAD_REQUEST;
    }

    env.res.query  = env.params.$query.query;
    env.res.sort   = env.params.$query.sort;
    env.res.period = env.params.$query.period;
    env.res.hid    = Number(env.params.$query.hid);

    env.res.type          = type;
    env.res.sort_types    = sort_types;
    env.res.period_types  = period_types;
    env.res.content_types = content_types;

    // an amount of search results loaded at once,
    // it is expected to be overriden for different content types
    env.res.items_per_page = 40;

    env.res.filter_title = env.data.club.title;
  });
};
