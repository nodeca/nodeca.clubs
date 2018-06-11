// Extend `internal:common.abuse_report` to send abuse report for type `CLUB_SOLE`
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

  // Subcall `internal:clubs.abuse_report` for `CLUB_SOLE` content type
  //
  N.wire.on('internal:common.abuse_report', async function club_sole_abuse_report_subcall(params) {
    if (params.report.type === N.shared.content_type.CLUB_SOLE) {
      params.data = params.data || {};
      await N.wire.emit('internal:common.abuse_report.club_sole', params);
    }
  });


  // Fetch club
  //
  N.wire.before(apiPath, async function fetch_club(params) {
    params.data.club = await N.models.clubs.Club.findById(params.report.src).lean(true);

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


  // Prepare locals
  //
  N.wire.on(apiPath, async function prepare_locals(params) {
    let locals = params.locals || {};
    let author = params.report.from ? await userInfo(N, params.report.from) : null;

    params.log_templates = {
      body: 'common.abuse_report.club_sole.log_templates.body',
      subject: 'common.abuse_report.club_sole.log_templates.subject'
    };

    params.email_templates = {
      body: 'common.abuse_report.club_sole.email_templates.body',
      subject: 'common.abuse_report.club_sole.email_templates.subject'
    };

    locals.project_name = await N.settings.get('general_project_name');
    locals.report_text = params.report.text;
    locals.club_url = N.router.linkTo('clubs.sole', {
      club_hid:  params.data.club.hid
    });
    locals.club_title = params.data.club.title;
    locals.club_description = params.data.club.description;
    locals.recipients = _.values(params.recipients);

    if (author) locals.author = author;

    params.locals = locals;
  });
};
