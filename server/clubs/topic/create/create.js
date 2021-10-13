// Create new topic
//
'use strict';


const $         = require('nodeca.core/lib/parser/cheequery');
const charcount = require('charcount');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid:                 { type: 'integer', required: true },
    title:                    { type: 'string', required: true },
    txt:                      { type: 'string', required: true },
    option_no_mlinks:         { type: 'boolean', required: true },
    option_no_emojis:         { type: 'boolean', required: true },
    option_no_quote_collapse: { type: 'boolean', required: true }
  });


  // Check auth
  //
  N.wire.before(apiPath, function check_user_auth(env) {
    if (!env.user_info.is_member) throw N.io.FORBIDDEN;
  });


  // Check title length
  //
  N.wire.before(apiPath, async function check_title_length(env) {
    let min_length = await env.extras.settings.fetch('clubs_topic_title_min_length');

    if (charcount(env.params.title.trim()) < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_title_too_short', min_length)
      };
    }
  });


  // Fetch club info and membership
  //
  N.wire.before(apiPath, async function fetch_club_info(env) {
    let club = await N.models.clubs.Club.findOne()
                         .where('hid').equals(env.params.club_hid)
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;

    let membership = await N.models.clubs.Membership.findOne()
                               .where('user').equals(env.user_info.user_id)
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    env.data.is_club_member = !!membership;
    env.data.is_club_owner  = !!membership?.is_owner;
  });


  // Check if user has an access to this club
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { clubs: env.data.club, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.club', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permission to reply in this club
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    if (!env.data.is_club_member) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_members_only')
      };
    }

    let can_start_topics = await env.extras.settings.fetch('clubs_can_start_topics');

    if (!can_start_topics) throw N.io.FORBIDDEN;
  });


  // Prepare parse options
  //
  N.wire.before(apiPath, async function prepare_options(env) {
    let settings = await N.settings.getByCategory(
      'clubs_posts_markup',
      { usergroup_ids: env.user_info.usergroups },
      { alias: true });

    if (env.params.option_no_mlinks) {
      settings.link_to_title = false;
      settings.link_to_snippet = false;
    }

    if (env.params.option_no_emojis) {
      settings.emoji = false;
    }

    if (env.params.option_no_quote_collapse) {
      settings.quote_collapse = false;
    }

    env.data.parse_options = settings;
  });


  // Parse user input to HTML
  //
  N.wire.on(apiPath, async function parse_text(env) {
    env.data.parse_result = await N.parser.md2html({
      text: env.params.txt,
      options: env.data.parse_options,
      user_info: env.user_info
    });
  });


  // Check post length
  //
  N.wire.after(apiPath, async function check_post_length(env) {
    let min_length = await env.extras.settings.fetch('clubs_post_min_length');

    if (env.data.parse_result.text_length < min_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_text_too_short', min_length)
      };
    }
  });


  // Limit an amount of images in the post
  //
  N.wire.after(apiPath, async function check_images_count(env) {
    let max_images = await env.extras.settings.fetch('clubs_post_max_images');

    if (max_images <= 0) return;

    let ast         = $.parse(env.data.parse_result.html);
    let images      = ast.find('.image').length;
    let attachments = ast.find('.attach').length;

    if (images + attachments > max_images) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_too_many_images', max_images)
      };
    }
  });


  // Limit an amount of emoticons in the post
  //
  N.wire.after(apiPath, async function check_emoji_count(env) {
    let max_emojis = await env.extras.settings.fetch('clubs_post_max_emojis');

    if (max_emojis < 0) return;

    if ($.parse(env.data.parse_result.html).find('.emoji').length > max_emojis) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_too_many_emojis', max_emojis)
      };
    }
  });


  // Create new topic
  //
  N.wire.after(apiPath, async function create_topic(env) {
    let topic = new N.models.clubs.Topic();
    let post  = new N.models.clubs.Post();

    env.data.new_topic = topic;
    env.data.new_post  = post;

    // Fill post data
    post.user         = env.user_info.user_id;
    post.ts           = Date.now();
    post.html         = env.data.parse_result.html;
    post.md           = env.params.txt;
    post.ip           = env.req.ip;
    post.params       = env.data.parse_options;
    post.imports      = env.data.parse_result.imports;
    post.import_users = env.data.parse_result.import_users;

    if (env.user_info.hb) {
      post.st  = N.models.clubs.Post.statuses.HB;
      post.ste = N.models.clubs.Post.statuses.VISIBLE;
    } else {
      post.st  = N.models.clubs.Post.statuses.VISIBLE;
    }

    // Fill topic data
    topic.title = env.params.title.trim();
    topic.club  = env.data.club._id;

    if (env.user_info.hb) {
      topic.st  = N.models.clubs.Topic.statuses.HB;
      topic.ste = N.models.clubs.Topic.statuses.OPEN;
    } else {
      topic.st  = N.models.clubs.Topic.statuses.OPEN;
    }

    topic.cache = {};

    topic.cache.post_count = 1;

    topic.cache.first_post = post._id;
    topic.cache.first_ts   = post.ts;
    topic.cache.first_user = post.user;

    topic.cache.last_post     = post._id;
    topic.cache.last_ts       = post.ts;
    topic.cache.last_post_hid = 1;
    topic.cache.last_user     = post.user;

    Object.assign(topic.cache_hb, topic.cache);

    await topic.save();

    post.topic = topic._id;
    post.club  = topic.club;

    await post.save();

    env.res.topic_hid = topic.hid;
    env.res.post_hid  = post.hid;
  });


  // Schedule image size fetch
  //
  N.wire.after(apiPath, async function fill_image_info(env) {
    await N.queue.club_post_images_fetch(env.data.new_post._id).postpone();
  });


  // Schedule search index update
  //
  N.wire.after(apiPath, async function add_search_index(env) {
    await N.queue.club_topics_search_update_with_posts([ env.data.new_topic._id ]).postpone();
  });


  // Update club counters
  //
  N.wire.after(apiPath, async function update_club(env) {
    await N.models.clubs.Club.updateCache(env.data.new_topic.club);
  });


  // Update user counters
  //
  N.wire.after(apiPath, async function update_user(env) {
    await N.models.clubs.UserTopicCount.inc(env.user_info.user_id, {
      is_hb: env.user_info.hb
    });

    await N.models.clubs.UserPostCount.inc(env.user_info.user_id, {
      is_hb: env.user_info.hb
    });
  });


  // Add new topic notification for subscribers
  //
  N.wire.after(apiPath, async function add_new_post_notification(env) {
    await N.wire.emit('internal:users.notify', {
      src: env.data.new_topic._id,
      type: 'CLUBS_NEW_TOPIC'
    });
  });


  // Automatically subscribe to this topic, unless user already subscribed
  //
  N.wire.after(apiPath, async function auto_subscription(env) {
    let type_name = await env.extras.settings.fetch('default_subscription_mode');
    if (type_name === 'NORMAL') return;

    await N.models.users.Subscription.updateOne(
      { user: env.user_info.user_id, to: env.data.new_topic._id },
      {
        // if document exists, it won't be changed
        $setOnInsert: {
          type: N.models.users.Subscription.types[type_name],
          to_type: N.shared.content_type.CLUB_TOPIC
        }
      },
      { upsert: true });
  });


  // Mark user as active, so it won't get auto-deleted later if user no longer visits the site
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    await N.wire.emit('internal:users.mark_user_active', env);
  });
};
