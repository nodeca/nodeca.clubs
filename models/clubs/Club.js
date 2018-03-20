'use strict';


const _        = require('lodash');
const Mongoose = require('mongoose');
const Schema   = Mongoose.Schema;


module.exports = function (N, collectionName) {

  function set_content_type(name, value) {
    let duplicate = _.invert(_.get(N, 'shared.content_type', {}))[value];

    if (typeof duplicate !== 'undefined') {
      throw new Error(`Duplicate content type id=${value} for ${name} and ${duplicate}`);
    }

    _.set(N, 'shared.content_type.' + name, value);
  }

  set_content_type('CLUB_SOLE', 9);

  let cache = {
    last_ts:  Date
  };

  let Club = new Schema({
    title:        String,
    description:  String,
    created_ts:   { type: Date, 'default': Date.now },

    // user-friendly id (autoincremented)
    hid:          { type: Number, index: true },

    // member count
    members:      Number,
    members_hb:   Number,

    avatar_id:    Schema.Types.ObjectId,

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


  // Update `last_ts` in the cache.
  //
  Club.statics.updateCache = async function (club_id) {
    let Topic = N.models.clubs.Topic;
    let Club = N.models.clubs.Club;

    let updateData = {};
    let visible_st_hb = [ Topic.statuses.HB ].concat(Topic.statuses.LIST_VISIBLE);
    let topic = await Topic.findOne({ club: club_id, st: { $in: visible_st_hb } })
      .sort('-cache_hb.last_post');

    // all topics in this club are deleted
    if (!topic) {
      let club = await Club.findById(club_id).lean(true);
      updateData['cache.last_ts'] = club.created_ts;
      updateData['cache_hb.last_ts'] = club.created_ts;
    } else {
      // Last post in this club is considered hellbanned if
      //  (whole topic has HB status) OR (last post has HB status)
      //
      // Last post in the topic is hellbanned if topic.cache differs from topic.cache_hb
      //
      let last_post_hb = (topic.st === Topic.statuses.HB) ||
        (String(topic.cache.last_post) !== String(topic.cache_hb.last_post));

      updateData['cache_hb.last_ts'] = topic.cache_hb.last_ts;

      if (!last_post_hb) {
        // If the last post in this section is not hellbanned, it is seen as
        // such for both hb and non-hb users. Thus, cache is the same for both.
        //
        updateData['cache.last_ts'] = updateData['cache_hb.last_ts'];
      } else {
        topic = await Topic.findOne({ club: club_id, st: { $in: Topic.statuses.LIST_VISIBLE } })
          .sort('-cache.last_post');

        // all visible topics in this club are deleted
        if (!topic) {
          let club = await Club.findById(club_id).lean(true);
          updateData['cache.last_ts'] = club.created_ts;
        } else {
          updateData['cache.last_ts'] = topic.cache.last_ts;
        }
      }
    }

    await Club.update({ _id: club_id }, updateData);
  };

  N.wire.on('init:models', function emit_init_Club() {
    return N.wire.emit('init:models.' + collectionName, Club);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Club(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
