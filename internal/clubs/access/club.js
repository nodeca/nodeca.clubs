// Check club permissions
//
// In:
//
// - params.clubs - array of id or models.clubs.Club. Could be plain value
// - params.user_info - user id or Object with `usergroups` array
// - params.preload - array of posts, topics or clubs (used as a cache)
// - data - cache + result
//   - access_read
//   - clubs
// - cache - object of `id => post, topic or club`, only used internally
//
// Out:
//
// - data.access_read - array of boolean. If `params.clubs` is not array - will be plain boolean
//

'use strict';


const ObjectId = require('mongoose').Types.ObjectId;
const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  //////////////////////////////////////////////////////////////////////////
  // Hook for the "get permissions by url" feature, used in snippets
  //
  N.wire.on('internal:common.access', async function check_club_access(access_env) {
    let match = N.router.matchAll(access_env.params.url).reduce(
      (acc, match) => (match.meta.methods.get === 'clubs.sole' ? match : acc),
      null);

    if (!match) return;

    let result = await N.models.clubs.Club.findOne()
                           .where('hid').equals(match.params.club_hid)
                           .select('_id exists')
                           .lean(true);

    if (!result) return;

    let access_env_sub = { params: { clubs: result, user_info: access_env.params.user_info } };

    await N.wire.emit('internal:clubs.access.club', access_env_sub);

    access_env.data.access_read = access_env_sub.data.access_read;
  });


  /////////////////////////////////////////////////////////////////////////////
  // Initialize return value for data.access_read
  //
  N.wire.before(apiPath, { priority: -100 }, function init_access_read(locals) {
    locals.data = locals.data || {};

    let clubs = Array.isArray(locals.params.clubs) ?
                locals.params.clubs :
                [ locals.params.clubs ];

    locals.data.club_ids = clubs.map(function (club) {
      return ObjectId.isValid(club) ? club : club._id;
    });

    locals.data.access_read = locals.data.club_ids.map(() => null);

    // fill in cache
    locals.cache = locals.cache || {};

    clubs.forEach(club => {
      if (!ObjectId.isValid(club)) locals.cache[club._id] = club;
    });

    (locals.params.preload || []).forEach(object => { locals.cache[object._id] = object; });
  });


  // Fetch user user_info if it's not present already
  //
  N.wire.before(apiPath, async function fetch_usergroups(locals) {
    if (ObjectId.isValid(String(locals.params.user_info))) {
      locals.data.user_info = await userInfo(N, locals.params.user_info);
      return;
    }

    // Use presented
    locals.data.user_info = locals.params.user_info;
  });


  // Fetch clubs if it's not present already
  //
  N.wire.before(apiPath, async function fetch_clubs(locals) {
    let ids = locals.data.club_ids
                  .filter((__, i) => locals.data.access_read[i] !== false)
                  .filter(id => !locals.cache[id]);

    if (!ids.length) return;

    let result = await N.models.clubs.Club.find()
                           .where('_id').in(ids)
                           .select('_id exists')
                           .lean(true);

    result.forEach(club => {
      locals.cache[club._id] = club;
    });

    // mark all clubs that weren't found as "no access"
    locals.data.club_ids.forEach((id, i) => {
      if (!locals.cache[id]) locals.data.access_read[i] = false;
    });
  });


  // Check club permissions
  //
  N.wire.on(apiPath, async function check_club_access(locals) {
    let params = {
      user_id: locals.data.user_info.user_id,
      usergroup_ids: locals.data.user_info.usergroups
    };

    let clubs_mod_can_delete_clubs = await N.settings.get('clubs_mod_can_delete_clubs', params, {});

    locals.data.club_ids.forEach((id, i) => {
      if (locals.data.access_read[i] === false) return; // continue

      let club = locals.cache[id];
      let allow_access = club.exists || clubs_mod_can_delete_clubs;

      if (!allow_access) {
        locals.data.access_read[i] = false;
      }
    });
  });


  // If no function reported error at this point, allow access
  //
  N.wire.after(apiPath, { priority: 100 }, function allow_read(locals) {
    locals.data.access_read = locals.data.access_read.map(val => val !== false);

    // If `params.clubs` is not array - `data.access_read` should be also not an array
    if (!Array.isArray(locals.params.clubs)) {
      locals.data.access_read = locals.data.access_read[0];
    }
  });
};
