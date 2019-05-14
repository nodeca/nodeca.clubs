// Keeping track of a number of posts made in all clubs by each user
//

'use strict';


const _        = require('lodash');
const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let UserPostCount = new Schema({
    user:     Schema.ObjectId,
    value:    Number,
    value_hb: Number
  }, {
    versionKey: false
  });


  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // find stats for a user
  UserPostCount.index({ user: 1 });

  /*
   * Get stats object for a user
   *
   * Params:
   *
   *  - user_id (ObjectId or Array)
   *  - current_user_info (Object) - same as env.user_info
   *
   * Returns a Number (number of posts made in clubs,
   * hb are counted only if user is hb).
   *
   * When there's no data available, it returns 0 and schedules
   * background recount.
   */
  UserPostCount.statics.get = async function get(user_id, current_user_info) {
    let is_bulk = true;

    if (!Array.isArray(user_id)) {
      is_bulk = false;
      user_id = [ user_id ];
    }

    let data = _.keyBy(
      await N.models.clubs.UserPostCount.find()
                .where('user').in(user_id)
                .lean(true),
      'user'
    );

    let users_need_recount = [];
    let result = user_id.map(u => {
      let d = data[u];

      if (!d) {
        users_need_recount.push(u);
        return 0;
      }

      return d[current_user_info.hb ? 'value_hb' : 'value'] || 0;
    });

    if (users_need_recount.length > 0) {
      await N.wire.emit('internal:users.activity.recount',
        users_need_recount.map(u => [ 'club_posts', { user_id: u } ])
      );
    }

    return is_bulk ? result : result[0];
  };


  /*
   * Increment post counter by 1 for a user
   *
   * Params:
   *
   *  - user_id (ObjectId)
   *  - options
   *     - is_hb (Boolean), required
   *
   * When there's no data available, it doesn't change data and schedules
   * background recount instead.
   */
  UserPostCount.statics.inc = async function inc(user_id, { is_hb }) {
    let data = await N.models.clubs.UserPostCount.findOneAndUpdate(
      { user: user_id },
      {
        $inc: {
          value: is_hb ? 0 : 1,
          value_hb: 1
        }
      },
    );

    if (!data) {
      await N.wire.emit('internal:users.activity.recount', [ [ 'club_posts', { user_id } ] ]);
    }
  };


  /*
   * Run background recount for user data
   *
   * Params (single query):
   *  - user_id (ObjectId)
   *
   * Params (bulk query):
   *  - [ user_id1, user_id2, ... ]
   *
   * Triggers background recount for user in all clubs.
   */
  UserPostCount.statics.recount = async function recount(user_id) {
    let bulk_data;

    if (Array.isArray(user_id)) {
      // support for bulk call, recount([ user1, user2, ... ]);
      bulk_data = user_id;
    } else {
      bulk_data = [ user_id ];
    }

    await N.wire.emit('internal:users.activity.recount', bulk_data.map(user_id => ([
      'club_posts',
      { user_id }
    ])));
  };


  N.wire.on('init:models', function emit_init_UserPostCount() {
    return N.wire.emit('init:models.' + collectionName, UserPostCount);
  });


  N.wire.on('init:models.' + collectionName, function init_model_UserPostCount(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
