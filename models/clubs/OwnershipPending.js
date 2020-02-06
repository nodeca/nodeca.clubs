// List of ownership invites awaiting confirmation
//

'use strict';


const Mongoose    = require('mongoose');
const Schema      = Mongoose.Schema;
const createToken = require('nodeca.core/lib/app/random_token');

const TOKEN_EXPIRE_TIMEOUT = 7 * 24 * 60 * 60; // 7 days


module.exports = function (N, collectionName) {

  let OwnershipPending = new Schema({
    user: Schema.Types.ObjectId,
    club: Schema.Types.ObjectId,
    ts: { type: Date, default: Date.now, expires: TOKEN_EXPIRE_TIMEOUT },
    from: Schema.Types.ObjectId,
    secret_key: { type: String, default: createToken }
  }, {
    versionKey: false
  });


  //////////////////////////////////////////////////////////////////////////////
  // Indexes

  // - find all pending requests in a club
  // - check if user has an active request
  OwnershipPending.index({ club: 1, user: 1 });


  N.wire.on('init:models', function emit_init_OwnershipPending() {
    return N.wire.emit('init:models.' + collectionName, OwnershipPending);
  });

  N.wire.on('init:models.' + collectionName, function init_model_OwnershipPending(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
