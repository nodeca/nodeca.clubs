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
// - email_templates - { body, subject }
// - log_templates - { body, subject }
//
//
'use strict';


const _        = require('lodash');
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

    let user_infos = await userInfo(N, _.map(recipients, '_id'));

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

    let membership = await N.models.clubs.ClubMember.find()
                               .where('club').equals(params.data.club._id)
                               .where('is_owner').equals(true)
                               .sort('joined_ts')
                               .lean(true);

    let userids = _.map(membership, 'user');

    // don't send to club owners if abuse was reported against one
    if (userids.some(u => String(u) === String(params.data.post.user))) return;

    let recipients = await N.models.users.User.find()
                               .where('_id').in(userids)
                               .lean(true);

    let user_infos = await userInfo(N, _.map(recipients, '_id'));

    for (let user_id of Object.keys(user_infos)) {
      params.recipients[user_id] = user_infos[user_id];
    }
  });


  // Prepare locals
  //
  N.wire.on(apiPath, async function prepare_locals(params) {
    let locals = params.locals || {};
    let author = params.report.from ? await userInfo(N, params.report.from) : null;

    params.log_templates = {
      body: 'common.abuse_report.club_post.log_templates.body',
      subject: 'common.abuse_report.club_post.log_templates.subject'
    };

    params.email_templates = {
      body: 'common.abuse_report.club_post.email_templates.body',
      subject: 'common.abuse_report.club_post.email_templates.subject'
    };

    locals.project_name = await N.settings.get('general_project_name');
    locals.report_text = params.report.text;
    locals.src_url = N.router.linkTo('clubs.topic', {
      club_hid:  params.data.club.hid,
      topic_hid: params.data.topic.hid,
      post_hid: params.data.post.hid
    });
    locals.src_text = params.data.post.md;
    locals.src_html = params.data.post.html;
    locals.recipients = _.values(params.recipients);
    locals.auto_reported = params.report.auto_reported;

    if (author) locals.author = author;

    params.locals = locals;
  });
};
