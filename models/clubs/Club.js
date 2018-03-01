'use strict';


const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  let cache = {
    last_ts:  Date
  };

  let Club = new Schema({
    title:        String,
    description:  String,

    // user-friendly id (autoincremented)
    hid:          { type: Number, index: true },

    admin_ids:    [ Schema.ObjectId ],

    // member count
    members:      Number,
    members_hb:   Number,

    // cache
    cache,
    cache_hb:     cache
  }, {
    versionKey : false
  });


  // Indexes
  ////////////////////////////////////////////////////////////////////////////////


  // Hooks
  ////////////////////////////////////////////////////////////////////////////////

  // Set 'hid' for the new club.
  // This hook should always be the last one to avoid counter increment on error
  Club.pre('save', function (callback) {
    if (!this.isNew) {
      callback();
      return;
    }

    if (this.hid) {
      // hid is already defined when this club was created, used in vbconvert;
      // it's caller responsibility to increase Increment accordingly
      callback();
      return;
    }

    N.models.core.Increment.next('clubs_sole', (err, value) => {
      if (err) {
        callback(err);
        return;
      }

      this.hid = value;
      callback();
    });
  });


  N.wire.on('init:models', function emit_init_Club() {
    return N.wire.emit('init:models.' + collectionName, Club);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Club(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
