// Get post src html, update post
//
'use strict';


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    post_id: { format: 'mongo', required: true }
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
  });


  // Fetch attachments info
  //
  N.wire.before(apiPath, async function fetch_attachments(env) {
    if (!env.data.post.attach || !env.data.post.attach.length) {
      env.data.attachments = [];
      return;
    }

    let attachments = await N.models.users.MediaInfo.find()
                                .where('media_id').in(env.data.post.attach)
                                .select('media_id file_name type')
                                .lean(true);

    // Sort in the same order as it was in post
    env.data.attachments = env.data.post.attach.reduce((acc, media_id) => {
      let attach = attachments.find(attachment => String(attachment.media_id) === String(media_id));

      if (attach) {
        acc.push(attach);
      }
      return acc;
    }, []);
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
    env.res.attachments = env.data.attachments;
    env.res.params = env.data.post_params;
  });
};
