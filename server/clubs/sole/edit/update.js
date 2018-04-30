// Update club title and description
//

'use strict';


const charcount = require('charcount');


module.exports = function (N, apiPath) {

  N.validate(apiPath, {
    club_id:     { format: 'mongo', required: true },
    title:       { type: 'string',  required: true },
    description: { type: 'string',  required: true }
  });


  // Fetch club info and membership
  //
  N.wire.before(apiPath, async function fetch_club_info(env) {
    let club = await N.models.clubs.Club.findById(env.params.club_id)
                         .lean(true);

    if (!club) throw N.io.NOT_FOUND;

    env.data.club = club;

    let membership = await N.models.clubs.ClubMember.findOne()
                               .where('user').equals(env.user_info.user_id)
                               .where('club').equals(env.data.club._id)
                               .lean(true);

    env.data.is_club_member = !!membership;
    env.data.is_club_owner  = !!membership && membership.is_owner;
  });


  // Check permissions
  //
  N.wire.before(apiPath, async function check_permissions(env) {
    if (!env.data.is_club_owner) throw N.io.FORBIDDEN;
  });


  // Check title length
  //
  N.wire.before(apiPath, async function check_title_length(env) {
    let max_length = await env.extras.settings.fetch('clubs_club_title_max_length');
    let title_length = charcount(env.params.title.trim());

    if (title_length === 0) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_title_empty')
      };
    }

    if (title_length > max_length) {
      throw {
        code: N.io.CLIENT_ERROR,
        message: env.t('err_title_too_long', max_length)
      };
    }
  });


  // Update club info
  //
  N.wire.on(apiPath, function update_club(env) {
    return N.models.clubs.Club.update({ _id: env.data.club._id }, {
      $set: {
        title: env.params.title,
        description: env.params.description
      }
    });
  });
};
