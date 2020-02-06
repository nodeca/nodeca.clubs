// History of the edits in club info (title, description, etc.)
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let ClubHistory = new Schema({
    // club id
    club:        Schema.ObjectId,

    // user that changed club info
    user:        Schema.ObjectId,

    // club info before changes
    title:       String,
    description: String,
    is_closed:   Boolean,
    avatar_id:   Schema.ObjectId,

    // coordinates, either [ Number, Number ] or Null
    location:     Schema.Types.Mixed,

    // change time
    ts:         { type: Date, default: Date.now }
  }, {
    versionKey: false
  });


  // Indexes
  //////////////////////////////////////////////////////////////////////////////

  // find history for a particular club
  ClubHistory.index({ club: 1, _id: 1 });


  N.wire.on('init:models', function emit_init_ClubHistory() {
    return N.wire.emit('init:models.' + collectionName, ClubHistory);
  });


  N.wire.on('init:models.' + collectionName, function init_model_ClubHistory(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
