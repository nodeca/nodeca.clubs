// Log of the major club actions (blocking, leadership change)
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let ClubAuditLog = new Schema({
    club:        Schema.ObjectId,
    action:      String,

    // user who made this action
    user:        Schema.ObjectId,

    // user who action was made against (if applicable)
    target_user: Schema.ObjectId,

    // change time
    ts:         { type: Date, 'default': Date.now },

    // client info
    ip:         String,
    user_agent: String
  }, {
    versionKey: false
  });


  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // find log for a particular club
  ClubAuditLog.index({ club: 1, _id: 1 });


  N.wire.on('init:models', function emit_init_ClubAuditLog() {
    return N.wire.emit('init:models.' + collectionName, ClubAuditLog);
  });


  N.wire.on('init:models.' + collectionName, function init_model_ClubAuditLog(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
