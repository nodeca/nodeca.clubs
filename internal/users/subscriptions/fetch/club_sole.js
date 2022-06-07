// Fetch clubs for subscriptions
//
// In:
//
//  - params.user_info
//  - params.subscriptions
//  - params.count_only
//
// Out:
//
//  - count
//  - items
//  - missed_subscriptions - list of subscriptions for deleted topics
//                           (those subscriptions will be deleted later)
//  - res   - misc data (specific to template, merged with env.res)
//
'use strict';


const _             = require('lodash');
const sanitize_club = require('nodeca.clubs/lib/sanitizers/club');


module.exports = function (N, apiPath) {

  N.wire.on(apiPath, async function subscriptions_fetch_clubs(locals) {
    let subs = locals.params.subscriptions.filter(s => s.to_type === N.shared.content_type.CLUB_SOLE);

    locals.count = subs.length;
    locals.res = {};
    if (!locals.count || locals.params.count_only) return;

    // Fetch clubs
    let clubs = await N.models.clubs.Club.find().where('_id').in(subs.map(x => x.to)).lean(true);


    // Sanitize clubs
    clubs = await sanitize_club(N, clubs, locals.params.user_info);
    clubs = _.keyBy(clubs, '_id');

    locals.res.clubs = Object.assign(locals.res.clubs || {}, clubs);
    locals.items = subs;


    // Fill missed subscriptions (for deleted clubs)
    //
    let missed = subs.filter(s => !clubs[s.to]);

    locals.missed_subscriptions = locals.missed_subscriptions || [];
    locals.missed_subscriptions = locals.missed_subscriptions.concat(missed);
  });
};
