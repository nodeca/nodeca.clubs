// Sanitize statuses and fields for clubs
//
// - N
// - clubs - array of models.clubs.Club, or a single value
// - user_info - Object with `usergroups` array and `hb`
//
// Returns array of sanitized items. If `clubs` is not array, it will be single sanitized entry instead
//
'use strict';


const _ = require('lodash');

const fields = [
  '_id',
  'title',
  'description',
  'hid',
  'members',
  'avatar_id',
  'cache',
  'cache_hb'
];


module.exports = async function (N, clubs, user_info) {
  let res;

  if (!Array.isArray(clubs)) {
    res = [ clubs ];
  } else {
    res = clubs.slice();
  }

  res = res.map(item => _.pick(item, fields));

  let params = {
    user_id: user_info.user_id,
    usergroup_ids: user_info.usergroups
  };

  let can_see_hellbanned = await N.settings.get('can_see_hellbanned', params, {});

  res = res.map(item => {
    if (typeof item.cache_hb !== 'undefined' && (user_info.hb || can_see_hellbanned)) {
      item.cache = item.cache_hb;
    }
    delete item.cache_hb;

    return item;
  });

  if (Array.isArray(clubs)) return res;

  return res[0];
};

module.exports.fields = fields;
