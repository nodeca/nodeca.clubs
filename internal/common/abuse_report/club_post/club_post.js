// Extend `internal:common.abuse_report` to send abuse report for type `CLUB_POST`
//
// In:
//
// - report - N.models.core.AbuseReport
//
// Out:
//
// - recipients - { user_id: user_info }
// - locals - rendering data
// - subject_email
// - subject_log
// - template
//
'use strict';


const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  // Subcall `internal:clubs.abuse_report` for `CLUB_POST` content type
  //
  N.wire.on('internal:common.abuse_report', async function club_post_abuse_report_subcall(params) {
    if (params.report.type === N.shared.content_type.CLUB_POST) {
      params.data = params.data || {};
      await N.wire.emit('internal:common.abuse_report.club_post', params);
    }
  });


  // Fetch post, topic and club
  //
  N.wire.before(apiPath, async function fetch_post_topic_club(params) {
    params.data.post = await N.models.clubs.Post.findById(params.report.src).lean(true);

    if (!params.data.post) throw N.io.NOT_FOUND;

    params.data.topic = await N.models.clubs.Topic.findById(params.data.post.topic).lean(true);

    if (!params.data.topic) throw N.io.NOT_FOUND;

    params.data.club = await N.models.clubs.Club.findById(params.data.topic.club).lean(true);

    if (!params.data.club) throw N.io.NOT_FOUND;
  });


  // Send message to all users with infraction permissions
  //
  N.wire.before(apiPath, async function fetch_recipients(params) {
    params.recipients = params.recipients || {};

    let groups = await N.models.users.UserGroup.find().select('_id');

    let allowed_groups = [];

    for (let usergroup of groups) {
      let settings_params = {
        usergroup_ids: [ usergroup._id ]
      };

      let can_add_infractions = await N.settings.get('clubs_mod_can_add_infractions', settings_params, {});

      if (can_add_infractions) allowed_groups.push(usergroup._id);
    }

    let recipients = await N.models.users.User.find()
                               .where('usergroups').in(allowed_groups)
                               .select('_id')
                               .lean(true);

    let user_infos = await userInfo(N, recipients.map(x => x._id));

    // double-check all permissions in case a user is disallowed from another
    // group with force=true
    for (let user_id of Object.keys(user_infos)) {
      let user_info = user_infos[user_id];

      let settings_params = {
        user_id: user_info.user_id,
        usergroup_ids: user_info.usergroups
      };

      let can_add_infractions = await N.settings.get('clubs_mod_can_add_infractions', settings_params, {});

      if (can_add_infractions) params.recipients[user_id] = user_info;
    }
  });


  // Send message to club owners, but only if abuse report wasn't created
  // against one of them.
  //
  N.wire.before(apiPath, async function fetch_recipients(params) {
    params.recipients = params.recipients || {};

    let membership = await N.models.clubs.Membership.find()
                               .where('club').equals(params.data.club._id)
                               .where('is_owner').equals(true)
                               .sort('joined_ts')
                               .lean(true);

    let userids = membership.map(x => x.user);

    // don't send to club owners if abuse was reported against one
    if (userids.some(u => String(u) === String(params.data.post.user))) return;

    let recipients = await N.models.users.User.find()
                               .where('_id').in(userids)
                               .lean(true);

    let user_infos = await userInfo(N, recipients.map(x => x._id));

    for (let user_id of Object.keys(user_infos)) {
      params.recipients[user_id] = user_infos[user_id];
    }
  });


  // Prepare locals
  //
  N.wire.on(apiPath, async function prepare_locals(params) {
    let locals = params.locals || {};
    let author = params.report.from ? await userInfo(N, params.report.from) : null;

    const TEMPLATE_PATH = 'common.abuse_report.club_post';

    params.subject_log   = `${TEMPLATE_PATH}.subject_log`;
    params.subject_email = `${TEMPLATE_PATH}.subject_email`;
    params.template      = TEMPLATE_PATH;

    locals.project_name = await N.settings.get('general_project_name');
    locals.report_text = params.report.text;
    locals.src_url = N.router.linkTo('clubs.topic', {
      club_hid:  params.data.club.hid,
      topic_hid: params.data.topic.hid,
      post_hid: params.data.post.hid
    });
    locals.src_text = params.data.post.md;
    locals.auto_reported = params.report.auto_reported;

    // calculate minimum backtick length for ````quote, so it would encapsulate
    // original content (longest backtick sequence plus 1, but at least 3)
    let backtick_seq_len = Math.max.apply(
      null,
      ('`` ' + locals.report_text + ' ' + locals.src_text)
        .match(/`+/g) //`
        .map(s => s.length)
      ) + 1;

    locals.backticks = '`'.repeat(backtick_seq_len);

    if (author) {
      locals.author = author;
      locals.author_link = N.router.linkTo('users.member', { user_hid: author.user_hid });
    }

    params.locals = locals;
  });
};
