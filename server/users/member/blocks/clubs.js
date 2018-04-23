// Fill a list of clubs this user has joined
//
'use strict';


const _             = require('lodash');
const sanitize_club = require('nodeca.clubs/lib/sanitizers/club');


module.exports = function (N) {

  // Fetch user blog entries
  //
  N.wire.after('server:users.member', async function fetch_user_blog_entries(env) {
    let membership = await N.models.clubs.ClubMember.find()
                               .where('user').equals(env.data.user._id)
                               .lean(true);

    let clubs;

    if (membership.length > 0) {
      clubs = await N.models.clubs.Club.find()
                        .where('_id').in(_.map(membership, 'club'))
                        .lean(true);
    }

    clubs = _.sortBy(clubs, 'title');
    clubs = await sanitize_club(N, clubs, env.user_info);

    if (env.user_info.user_hid !== env.data.user.hid && clubs.length === 0) return;

    env.res.blocks = env.res.blocks || {};

    let is_owner = {};

    for (let m of membership) {
      if (m.is_owner) is_owner[m.club] = true;
    }

    _.set(env.res, 'blocks.clubs', {
      list:  clubs,
      count: clubs.length,
      is_owner
    });
  });
};
