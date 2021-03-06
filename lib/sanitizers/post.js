// Sanitize statuses and fields for posts
//
// - N
// - posts - array of models.clubs.Post. Could be plain value
// - user_info - Object with `usergroups` array and `hb`
// - callback - `function (err, res)`
//   - res - array of sanitized items. If `posts` is not array - will be plain sanitized post
//
'use strict';


const _ = require('lodash');


const fields = [
  '_id',
  'hid',
  'to',
  'topic',
  'to_user',
  'to_thid',
  'to_phid',
  'html',
  'user',
  'legacy_nick',
  'ts',
  'edit_count',
  'last_edit_ts',
  'st',
  'ste',
  'del_reason',
  'del_by',
  'votes',
  'votes_hb',
  'bookmarks'
];


module.exports = async function (N, posts, user_info) {
  let res;

  if (!Array.isArray(posts)) {
    res = [ posts ];
  } else {
    res = posts.slice();
  }

  res = res.map(item => _.pick(item, fields));

  let params = {
    user_id: user_info.user_id,
    usergroup_ids: user_info.usergroups
  };

  let { can_see_hellbanned, can_see_history } = await N.settings.get(
    [ 'can_see_hellbanned', 'can_see_history' ],
    params, {}
  );

  res = res.map(item => {
    if (item.st === N.models.clubs.Post.statuses.HB && !can_see_hellbanned) {
      item.st = item.ste;
      delete item.ste;
    }

    if (item.votes_hb && (user_info.hb || can_see_hellbanned)) {
      item.votes = item.votes_hb;
    }
    delete item.votes_hb;

    if (!can_see_history) {
      delete item.edit_count;
      delete item.last_edit_ts;
    }

    return item;
  });

  if (Array.isArray(posts)) return res;

  return res[0];
};

module.exports.fields = fields;
