// Fetch clubs for subscriptions
//
'use strict';


const _             = require('lodash');
const sanitize_club = require('nodeca.clubs/lib/sanitizers/club');


module.exports = function (N) {

  N.wire.on('internal:users.subscriptions.fetch', async function subscriptions_fetch_clubs(env) {
    let subs = env.data.subscriptions.filter(s => s.to_type === N.shared.content_type.CLUB_SOLE);

    // Fetch clubs
    let clubs = await N.models.clubs.Club.find().where('_id').in(subs.map(x => x.to)).lean(true);


    // Sanitize clubs
    clubs = await sanitize_club(N, clubs, env.user_info);
    clubs = _.keyBy(clubs, '_id');

    env.res.clubs = Object.assign(env.res.clubs || {}, clubs);


    // Fill missed subscriptions (for deleted clubs)
    //
    let missed = subs.filter(s => !clubs[s.to]);

    env.data.missed_subscriptions = env.data.missed_subscriptions || [];
    env.data.missed_subscriptions = env.data.missed_subscriptions.concat(missed);
  });
};
