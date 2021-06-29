// Save club location
//
'use strict';


// If same user edits the same club within 5 minutes, all changes
// made within that period will be squashed into one diff.
const HISTORY_GRACE_PERIOD = 5 * 60 * 1000;


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_hid:  { type: 'integer', required: true },
    latitude:  { type: 'number', minimum: -90,  maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 }
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


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    let settings = await env.extras.settings.fetch([
      'clubs_lead_can_edit_clubs',
      'clubs_mod_can_edit_clubs'
    ]);

    if (settings.clubs_mod_can_edit_clubs) return;
    if (env.data.is_club_owner && settings.clubs_lead_can_edit_clubs) return;

    throw N.io.FORBIDDEN;
  });


  // Save location
  //
  N.wire.on(apiPath, async function save_location(env) {
    let update_data = {
      $set: {
        location: [ env.params.longitude, env.params.latitude ]
      }
    };

    let update_result = await N.models.clubs.Club.updateOne({ _id: env.data.club._id }, update_data);

    env.data.is_updated = update_result.nModified > 0;

    // trigger location name resolution with priority,
    // so user will see location they just set quicker than usual
    N.models.clubs.Club.resolveLocation(env.data.club._id, env.user_info.locale);
  });


  // Save old version in club history
  //
  N.wire.after(apiPath, async function save_history(env) {
    if (!env.data.is_updated) return;

    let new_club = await N.models.clubs.Club.findById(env.data.club._id)
                             .lean(true);

    let last_entry = await N.models.clubs.ClubHistory.findOne({
      club: env.data.club._id
    }).sort('-_id').lean(true);

    let last_update_time = last_entry?.ts   ?? new Date(0);
    let last_update_user = last_entry?.user ?? null;
    let now = new Date();

    // if the same user edits the same club within grace period, history won't be changed
    if (!(last_update_time > now - HISTORY_GRACE_PERIOD &&
          last_update_time < now &&
          String(last_update_user) === String(env.user_info.user_id))) {

      /* eslint-disable no-undefined */
      last_entry = await new N.models.clubs.ClubHistory({
        club:        env.data.club._id,
        user:        env.user_info.user_id,
        title:       env.data.club.title,
        description: env.data.club.description,
        is_closed:   env.data.club.is_closed,
        avatar_id:   env.data.club.avatar_id,
        location:    env.data.club.location
      }).save();
    }

    // if the next history entry would be the same as the last one
    // (e.g. user saves post without changes or reverts change within 5 min),
    // remove redundant history entry
    if (last_entry) {
      let last_club_str = JSON.stringify({
        club:        last_entry.club,
        user:        last_entry.user,
        title:       last_entry.title,
        description: last_entry.description,
        is_closed:   last_entry.is_closed,
        avatar_id:   last_entry.avatar_id,
        location:    last_entry.location
      });

      let next_club_str = JSON.stringify({
        club:        new_club._id,
        user:        env.user_info.user_id,
        title:       new_club.title,
        description: new_club.description,
        is_closed:   new_club.is_closed,
        avatar_id:   new_club.avatar_id,
        location:    new_club.location
      });

      if (last_club_str === next_club_str) {
        await N.models.clubs.ClubHistory.deleteOne({ _id: last_entry._id });
      }
    }

    await N.models.clubs.Club.updateOne(
      { _id: env.data.club._id },
      { $set: {
        last_edit_ts: new Date(),
        edit_count: await N.models.clubs.ClubHistory.countDocuments({ club: env.data.club._id })
      } }
    );
  });


  // Mark user as active
  //
  N.wire.after(apiPath, async function set_active_flag(env) {
    await N.wire.emit('internal:users.mark_user_active', env);
  });
};
