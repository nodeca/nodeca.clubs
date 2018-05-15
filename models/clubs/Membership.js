'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let Membership = new Schema({
    club:      Schema.Types.ObjectId,
    user:      Schema.Types.ObjectId,
    is_owner:  { type: Boolean, 'default': false },
    joined_ts: { type: Date, 'default': Date.now }
  }, {
    versionKey: false
  });


  //////////////////////////////////////////////////////////////////////////////
  // Indexes

  // - get list of members
  // - get list of admins
  Membership.index({ club: 1, is_owner: 1 });

  // - get "my clubs" list
  // - get club membership settings for current user
  Membership.index({ user: 1, club: 1 });


  N.wire.on('init:models', function emit_init_Membership() {
    return N.wire.emit('init:models.' + collectionName, Membership);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Membership(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
