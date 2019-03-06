// Get post src html, update post
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true },
    as_moderator: { type: 'boolean', required: true }
  });


  // Fetch post
  //
  N.wire.before(apiPath, async function fetch_post(env) {
    let post = await N.models.clubs.Post.findOne({ _id: env.params.post_id }).lean(true);

    if (!post) throw N.io.NOT_FOUND;

    env.data.post = post;
  });


  // Fetch post params
  //
  N.wire.before(apiPath, async function fetch_post_params(env) {
    env.data.post_params = await N.models.core.MessageParams.getParams(env.data.post.params_ref);
  });


  // Fetch topic
  //
  N.wire.before(apiPath, async function fetch_topic(env) {
    let topic = await N.models.clubs.Topic.findOne({ _id: env.data.post.topic }).lean(true);

    if (!topic) throw N.io.NOT_FOUND;

    env.data.topic = topic;
  });


  // Fetch club info and membership
  //
  N.wire.before(apiPath, async function fetch_club_info(env) {
    let club = await N.models.clubs.Club.findById(env.data.topic.club)
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;

    let membership = await N.models.clubs.Membership.findOne()
                               .where('user').equals(env.user_info.user_id)
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    env.data.is_club_member = !!membership;
    env.data.is_club_owner  = !!membership && membership.is_owner;
  });


  // Check if user can see this post
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: {
      posts: env.data.post,
      user_info: env.user_info,
      preload: [ env.data.topic ]
    } };

    await N.wire.emit('internal:clubs.access.post', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let settings = await env.extras.settings.fetch([ 'clubs_lead_can_edit_posts', 'clubs_mod_can_edit_posts' ]);

    if (settings.clubs_mod_can_edit_posts && env.params.as_moderator) {
      return;
    }

    if (env.data.is_club_owner && settings.clubs_lead_can_edit_posts && env.params.as_moderator) {
      return;
    }

    if (!env.user_info.user_id || String(env.user_info.user_id) !== String(env.data.post.user)) {
      throw N.io.FORBIDDEN;
    }

    let clubs_edit_max_time = await env.extras.settings.fetch('clubs_edit_max_time');

    if (clubs_edit_max_time !== 0 && env.data.post.ts < Date.now() - clubs_edit_max_time * 60 * 1000) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('@clubs.topic.post.edit.err_perm_expired')
      };
    }

    // check if user is a member of the club, maybe he quit or got kicked
    // after posting this message
    if (!env.data.is_club_member) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('@clubs.topic.post.edit.err_members_only')
      };
    }

    // check if user has permission to reply, maybe he was banned after posting
    let can_reply = await env.extras.settings.fetch('clubs_can_reply');

    if (!can_reply) throw N.io.FORBIDDEN;
  });


  // Fill post data
  //
  N.wire.on(apiPath, function fill_data(env) {
    env.data.users = env.data.users || [];
    env.data.users.push(env.data.post.user);

    if (env.data.post.to_user) {
      env.data.users.push(env.data.post.to_user);
    }
    if (env.data.post.del_by) {
      env.data.users.push(env.data.post.del_by);
    }
    if (env.data.post.import_users) {
      env.data.users = env.data.users.concat(env.data.post.import_users);
    }

    env.res.user_id = env.data.post.user;
    env.res.md = env.data.post.md;
    env.res.params = env.data.post_params;
  });
};
