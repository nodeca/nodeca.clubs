// Keeping track of a number of topics made in all clubs by each user
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let UserTopicCount = new Schema({
    user:     Schema.ObjectId,
    value:    Number,
    value_hb: Number
  }, {
    versionKey: false
  });


  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // find stats for a user
  UserTopicCount.index({ user: 1 });

  /*
   * Get stats object for a user
   *
   * Params:
   *
   *  - user_id (ObjectId)
   *  - current_user_info (Object) - same as env.user_info
   *
   * Returns a Number (number of topics made in clubs,
   * hb are counted only if user is hb).
   *
   * When there's no data available, it returns 0 and schedules
   * background recount.
   */
  UserTopicCount.statics.get = async function get(user_id, current_user_info) {
    let data = await N.models.clubs.UserTopicCount.findOne()
                         .where('user').equals(user_id)
                         .lean(true);

    if (!data) {
      await N.wire.emit('internal:users.activity.recount', [ [ 'club_topics', { user_id } ] ]);
      return 0;
    }

    return data[current_user_info.hb ? 'value_hb' : 'value'] || 0;
  };


  /*
   * Increment topic counter by 1 for a user
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
  UserTopicCount.statics.inc = async function inc(user_id, { is_hb }) {
    let data = await N.models.clubs.UserTopicCount.findOneAndUpdate(
      { user: user_id },
      {
        $inc: {
          value: is_hb ? 0 : 1,
          value_hb: 1
        }
      },
    );

    if (!data) {
      await N.wire.emit('internal:users.activity.recount', [ [ 'club_topics', { user_id } ] ]);
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
  UserTopicCount.statics.recount = async function recount(user_id) {
    let bulk_data;

    if (Array.isArray(user_id)) {
      // support for bulk call, recount([ user1, user2, ... ]);
      bulk_data = user_id;
    } else {
      bulk_data = [ user_id ];
    }

    await N.wire.emit('internal:users.activity.recount', bulk_data.map(user_id => ([
      'club_topics',
      { user_id }
    ])));
  };


  N.wire.on('init:models', function emit_init_UserTopicCount() {
    return N.wire.emit('init:models.' + collectionName, UserTopicCount);
  });


  N.wire.on('init:models.' + collectionName, function init_model_UserTopicCount(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
