// Club page
//

'use strict';


const _  = require('lodash');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid:  { type: 'integer', required: true },
    topic_hid: { type: 'integer', required: false },
    $query:    {
      type: 'object',
      properties: {
        prev: { enum: [ '' ] },
        next: { enum: [ '' ] }
      },
      required: false,
      additionalProperties: false
    }
  });

  let buildTopicIdsBefore = require('./list/_build_topic_ids_before.js')(N);
  let buildTopicIdsAfter  = require('./list/_build_topic_ids_after.js')(N);


  async function buildTopicsIdsAndGetOffset(env) {
    let prev = false, next = false;

    if (env.params.$query) {
      let query = env.params.$query;

      prev = typeof query.prev !== 'undefined';
      next = typeof query.next !== 'undefined';
    }

    let statuses = _.without(env.data.topics_visible_statuses, N.models.clubs.Topic.statuses.PINNED);
    let limit_direction = prev || next;
    let current_topic;

    env.data.select_topics_start  = null;

    let results = [];

    if (env.params.topic_hid) {
      current_topic = await N.models.clubs.Topic.findOne({
        club: env.data.club._id,
        hid:  env.params.topic_hid,
        st:   { $in: statuses }
      });

      if (current_topic) {
        env.data.select_topics_start = current_topic[env.user_info.hb ? 'cache_hb' : 'cache'].last_post;
        results.push(current_topic._id);
      }
    }

    if (!limit_direction || prev) {
      env.data.select_topics_before = env.data.topics_per_page;
      await buildTopicIdsBefore(env);
      results = env.data.topics_ids.slice(0).concat(results);
    }

    if (!limit_direction || next) {
      env.data.select_topics_after = env.data.topics_per_page;
      await buildTopicIdsAfter(env);
      results = results.concat(env.data.topics_ids);
    }

    env.data.topics_ids = results;
  }

  // Subcall clubs.topic_list
  //
  N.wire.on(apiPath, async function subcall_topic_list(env) {
    env.data.club_hid          = env.params.club_hid;
    env.data.build_topics_ids  = buildTopicsIdsAndGetOffset;
    env.data.topics_per_page   = await env.extras.settings.fetch('topics_per_page');

    return N.wire.emit('internal:clubs.topic_list', env);
  });


  // Fetch location name if available
  //
  N.wire.after(apiPath, async function fetch_location(env) {
    if (!env.data.club.location) return;

    env.res.location_name = (await N.models.core.Location.info([ env.data.club.location ], env.user_info.locale))[0];
  });


  // Fetch club leaders
  //
  N.wire.after(apiPath, async function fetch_club_owners(env) {
    let membership = await N.models.clubs.Membership.find()
                               .where('club').equals(env.data.club._id)
                               .where('is_owner').equals(true)
                               .sort('joined_ts')
                               .lean(true);

    env.res.club_owner_ids = _.map(membership, 'user');

    env.data.users = (env.data.users || []).concat(env.res.club_owner_ids);
  });


  // Fetch pagination
  //
  N.wire.after(apiPath, async function fetch_pagination(env) {
    let statuses = _.without(env.data.topics_visible_statuses, N.models.clubs.Topic.statuses.PINNED);

    //
    // Count total amount of visible topics in the club
    //
    let counters_by_status = await Promise.all(
      statuses.map(st =>
        N.models.clubs.Topic
            .where('club').equals(env.data.club._id)
            .where('st').equals(st)
            .countDocuments()
      )
    );

    let pinned_count = env.data.topics_visible_statuses.indexOf(N.models.clubs.Topic.statuses.PINNED) === -1 ?
                       0 :
                       await N.models.clubs.Topic
                               .where('club').equals(env.data.club._id)
                               .where('st').equals(N.models.clubs.Topic.statuses.PINNED)
                               .countDocuments();

    let topic_count = _.sum(counters_by_status) + pinned_count;

    //
    // Count an amount of visible topics before the first one
    //
    let topic_offset = 0;

    // if first topic is pinned, it's a first page and topic_offset is zero
    if (env.data.topics.length && env.data.topics[0].st !== N.models.clubs.Topic.statuses.PINNED) {
      let cache        = env.user_info.hb ? 'cache_hb' : 'cache';
      let last_post_id = env.data.topics[0][cache].last_post;

      let counters_by_status = await Promise.all(
        statuses.map(st =>
          N.models.clubs.Topic
              .where(`${cache}.last_post`).gt(last_post_id)
              .where('club').equals(env.data.club._id)
              .where('st').equals(st)
              .countDocuments()
        )
      );

      topic_offset = _.sum(counters_by_status) + pinned_count;
    }

    env.res.pagination = {
      total:        topic_count,
      per_page:     env.data.topics_per_page,
      chunk_offset: topic_offset
    };
  });


  // Fill subscription type
  //
  N.wire.after(apiPath, async function fill_subscription(env) {
    if (!env.user_info.is_member) {
      env.res.subscription = null;
      return;
    }

    let subscription = await N.models.users.Subscription
                                .findOne({ user: env.user_info.user_id, to: env.data.club._id })
                                .lean(true);

    env.res.subscription = subscription ? subscription.type : null;
  });


  // Fill breadcrumbs info
  //
  N.wire.after(apiPath, async function fill_topic_breadcrumbs(env) {
    env.data.breadcrumbs = [];

    env.data.breadcrumbs.push({
      text: env.t('@common.menus.navbar.clubs'),
      route: 'clubs.index'
    });

    env.res.breadcrumbs = env.data.breadcrumbs;
  });


  // Fill head meta
  //
  N.wire.after(apiPath, function fill_head(env) {
    env.res.head = env.res.head || {};
    env.res.head.title = env.data.club.title;

    if (env.params.topic_hid) {
      env.res.head.robots = 'noindex,follow';
    }
  });


  // Fill 'prev' and 'next' links and meta tags
  //
  N.wire.after(apiPath, async function fill_prev_next(env) {
    env.res.head = env.res.head || {};

    let cache    = env.user_info.hb ? 'cache_hb' : 'cache';
    let statuses = _.without(env.data.topics_visible_statuses, N.models.clubs.Topic.statuses.PINNED);

    //
    // Fetch topic after last one, turn it into a link to the next page
    //
    if (env.data.topics.length > 0) {
      let last_post_id = env.data.topics[env.data.topics.length - 1][cache].last_post;

      let topic_data = await N.models.clubs.Topic.findOne()
                                 .where(`${cache}.last_post`).lt(last_post_id)
                                 .where('club').equals(env.data.club._id)
                                 .where('st').in(statuses)
                                 .select('hid -_id')
                                 .sort(`-${cache}.last_post`)
                                 .lean(true);

      if (topic_data) {
        env.res.head.next = N.router.linkTo('clubs.sole', {
          club_hid:  env.params.club_hid,
          topic_hid: topic_data.hid
        }) + '?next';
      }
    }

    //
    // Fetch topic before first one, turn it into a link to the previous page;
    // (there is no previous page if the first topic is pinned)
    //
    if (env.data.topics.length > 0 &&
        env.data.topics[0].st !== N.models.clubs.Topic.statuses.PINNED) {

      let last_post_id = env.data.topics[0][cache].last_post;

      let topic_data = await N.models.clubs.Topic.findOne()
                                 .where(`${cache}.last_post`).gt(last_post_id)
                                 .where('club').equals(env.data.club._id)
                                 .where('st').in(statuses)
                                 .select('hid')
                                 .sort(`${cache}.last_post`)
                                 .lean(true);

      if (topic_data) {
        env.res.head.prev = N.router.linkTo('clubs.sole', {
          club_hid:  env.params.club_hid,
          topic_hid: topic_data.hid
        }) + '?prev';
      }
    }

    //
    // Fetch last topic for the "move to bottom" button
    //
    if (env.data.topics.length > 0) {
      let topic_data = await N.models.clubs.Topic.findOne()
                                 .where('club').equals(env.data.club._id)
                                 .where('st').in(statuses)
                                 .select('hid')
                                 .sort(`${cache}.last_post`)
                                 .lean(true);

      if (topic_data) {
        env.res.last_topic_hid = topic_data.hid;
      }
    }
  });
};
