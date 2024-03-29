'use strict';


const Mongoose       = require('mongoose');
const Schema         = Mongoose.Schema;


module.exports = function (N, collectionName) {

  function set_content_type(name, value) {
    N.shared = N.shared || {};
    N.shared.content_type = N.shared.content_type || {};

    let duplicate = Object.entries(N.shared.content_type).find(([ , v ]) => v === value)?.[0];

    if (typeof duplicate !== 'undefined') {
      throw new Error(`Duplicate content type id=${value} for ${name} and ${duplicate}`);
    }

    N.shared.content_type[name] = value;
  }

  set_content_type('CLUB_POST', 11);

  let statuses = {
    VISIBLE:      1,
    HB:           2, // hellbanned
    PENDING:      3, // reserved, not used now
    DELETED:      4,
    DELETED_HARD: 5
  };


  statuses.LIST_DELETABLE = [ statuses.VISIBLE, statuses.HB, statuses.PENDING ];
  statuses.LIST_HARD_DELETABLE = [ ...statuses.LIST_DELETABLE, statuses.DELETED ];

  let Post = new Schema({
    topic:        Schema.ObjectId,
    club:         Schema.ObjectId,
    hid:          Number,

    // Related post for replies
    to:           Schema.ObjectId,
    user:         Schema.ObjectId,
    legacy_nick:  String,  // only if user id is undefined, e.g. guests
    ts:           { type: Date, default: Date.now },  // timestamp
    ip:           String,  // ip address

    // Data for displaying "replied to" link
    to_user:      Schema.ObjectId,
    to_phid:      Number,

    // for "reply in a new topic" feature; to_fhid does not make sense in clubs
    to_thid:      Number,

    html:         String,  // displayed HTML
    md:           String,  // markdown source

    // State (normal, closed, soft-deleted, hard-deleted, hellbanned,...)
    // constants should be defined globally
    st:           Number,
    ste:          Number,  // real state, if topic is sticky or hellbanned
                           // (general `state` is used for fast selects)

    // Flag set if topic state isn't deleted or hard deleted;
    // used in counting user's activity to quickly determine if a post
    // should be counted (i.e. in a visible topic) or not
    topic_exists: { type: Boolean, default: true },

    // Aggregated votes count
    votes:        { type: Number, default: 0 },
    votes_hb:     { type: Number, default: 0 },

    // An amount of edits made for this post
    edit_count:   Number,

    // Time when this post was last edited (null if no edits)
    last_edit_ts: Date,

    // Bookmarks count
    bookmarks:    { type: Number, default: 0 },

    del_reason:   String,
    del_by:       Schema.ObjectId,
    // Previous state for deleted posts
    prev_st:      {
      st: Number,
      ste: Number
    },

    // Post params
    params_ref:   Schema.ObjectId,

    // List of urls to accessible resources being used to build this post (snippets, etc.)
    imports:      [ String ],

    // List of users to fetch in order to properly display the post
    import_users: [ Schema.ObjectId ]
  }, {
    versionKey : false
  });

  // Indexes
  ////////////////////////////////////////////////////////////////////////////////

  //  - get a post by topic + hid
  //  - get posts by hid range
  //
  Post.index({
    topic: 1,
    hid:   1,
    st:    1
  });

  // - count all posts before current (pagination)
  //
  Post.index({
    topic: 1,
    st:    1,
    hid:   1
  });

  // - reindex all posts inside a club
  //
  Post.index({
    club: 1,
    _id:  1
  });

  // - count all messages from a user
  Post.index({
    user: 1,
    st: 1,
    topic_exists: 1
  });


  // Set 'hid' for the new post.
  //
  Post.pre('save', async function () {
    if (!this.isNew) return;

    let topic = await N.models.clubs.Topic.findByIdAndUpdate(
      this.topic,
      { $inc: { last_post_counter: 1 } },
      { new: true }
    );

    this.hid = topic.last_post_counter;
  });


  // Remove empty "imports" and "import_users" fields
  //
  Post.pre('save', function () {
    if (this.imports?.length === 0) {
      /*eslint-disable no-undefined*/
      this.imports = undefined;
    }

    if (this.import_users?.length === 0) {
      /*eslint-disable no-undefined*/
      this.import_users = undefined;
    }
  });


  // Store parser options separately and save reference to them
  //
  Post.pre('save', async function () {
    if (!this.params) return;

    let id = await N.models.core.MessageParams.setParams(this.params);

    /*eslint-disable no-undefined*/
    this.params = undefined;
    this.params_ref = id;
  });


  // Export statuses
  //
  Post.statics.statuses = statuses;


  N.wire.on('init:models', function emit_init_Post() {
    return N.wire.emit('init:models.' + collectionName, Post);
  });

  N.wire.on('init:models.' + collectionName, function init_model_Post(schema) {
    N.models[collectionName] = Mongoose.model(collectionName, schema);
  });
};
