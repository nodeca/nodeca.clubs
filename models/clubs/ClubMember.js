'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let ClubMember = new Schema({
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
  ClubMember.index({ club: 1, is_owner: 1 });

  // "my clubs"
  ClubMember.index({ user: 1 });


  N.wire.on('init:models', function emit_init_ClubMember() {
    return N.wire.emit('init:models.' + collectionName, ClubMember);
  });

  N.wire.on('init:models.' + collectionName, function init_model_ClubMember(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
