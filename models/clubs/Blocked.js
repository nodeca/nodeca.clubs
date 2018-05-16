// List of users banned from clubs
//

'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let Blocked = new Schema({
    user: Schema.Types.ObjectId,
    club: Schema.Types.ObjectId,

    // user id of club owner who made this ban
    from: Schema.Types.ObjectId,
    ts: { type: Date, 'default': Date.now }
  }, {
    versionKey: false
  });


  //////////////////////////////////////////////////////////////////////////////
  // Indexes

  // - find all banned users in a club
  // - check if user is banned in a club
  Blocked.index({ club: 1, user: 1 });


  N.wire.on('init:models', function emit_init_Blocked() {
    return N.wire.emit('init:models.' + collectionName, Blocked);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Blocked(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
