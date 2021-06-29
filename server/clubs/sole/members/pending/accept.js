// Approve user membership request
//

'use strict';

const userInfo = require('nodeca.users/lib/user_info');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    user_id: { format: 'mongo', required: true },
    club_id: { format: 'mongo', required: true }
  });


  // Fetch club info and membership
  //
  N.wire.before(apiPath, async function fetch_club_info(env) {
    let club = await N.models.clubs.Club.findById(env.params.club_id)
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;

    let membership = await N.models.clubs.Membership.findOne()
                               .where('user').equals(env.user_info.user_id)
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    env.res.is_club_member = env.data.is_club_member = !!membership;
    env.res.is_club_owner  = env.data.is_club_owner  = !!membership?.is_owner;
  });


  // Check if user has an access to this club
  //
  N.wire.before(apiPath, async function check_access(env) {
    let access_env = { params: { clubs: env.data.club, user_info: env.user_info } };

    await N.wire.emit('internal:clubs.access.club', access_env);

    if (!access_env.data.access_read) throw N.io.NOT_FOUND;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let settings = await env.extras.settings.fetch([
      'clubs_lead_can_edit_club_members',
      'clubs_mod_can_edit_club_members'
    ]);

    if (env.data.is_club_owner && settings.clubs_lead_can_edit_club_members) return;
    if (settings.clubs_mod_can_edit_club_members) return;

    throw N.io.NOT_FOUND;
  });


  // Fetch target user and check if they requested membership
  //
  N.wire.before(apiPath, async function fetch_user(env) {
    let request = await N.models.clubs.MembershipPending.findOne()
                            .where('user').equals(env.params.user_id)
                            .where('club').equals(env.data.club._id)
                            .lean(true);

    if (!request) throw N.io.NOT_FOUND;

    // check that user exists
    env.data.user = await N.models.users.User.findById(request.user)
                              .where('exists').equals(true)
                              .lean(true);

    if (!env.data.user) throw N.io.NOT_FOUND;
  });


  // Add user to the club
  //
  N.wire.on(apiPath, async function club_join(env) {
    // create membership record, use upsert to avoid race condition duplicates
    await N.models.clubs.Membership.updateOne(
      { club: env.data.club._id, user: env.data.user._id },
      { $setOnInsert: { is_owner: false, joined_ts: new Date() } },
      { upsert: true }
    );

    await N.models.clubs.Club.updateMembers(env.data.club._id);
  });


  // Remove membership request
  //
  N.wire.after(apiPath, async function remove_request(env) {
    await N.models.clubs.MembershipPending.deleteOne(
      { user: env.params.user_id, club: env.data.club._id }
    );
  });


  // Notify user via email
  //
  N.wire.after(apiPath, async function notify_user(env) {
    let to = await userInfo(N, env.data.user._id);
    let locale = to.locale || N.config.locales[0];

    let general_project_name = await N.settings.get('general_project_name');

    let subject = N.i18n.t(locale, 'clubs.sole.members.pending.accept.email_subject', {
      project_name: general_project_name
    });

    let text = N.i18n.t(locale, 'clubs.sole.members.pending.accept.email_text', {
      club_title: env.data.club.title,
      club_link: N.router.linkTo('clubs.sole', {
        club_hid: env.data.club.hid
      })
    });

    await N.mailer.send({
      to: env.data.user.email,
      subject,
      text,
      safe_error: true
    });
  });
};
