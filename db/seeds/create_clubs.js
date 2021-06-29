// Create demo clubs with topics and posts
//
'use strict';


const charlatan = require('charlatan');
const ObjectId  = require('mongoose').Types.ObjectId;


const USER_COUNT              = 50;
const TOTAL_CLUB_COUNT        = 10;
const SUBSCRIBED_CLUB_COUNT   = 7;
const TOPIC_COUNT_IN_BIG_CLUB = 100;
const POST_COUNT_IN_BIG_TOPIC = 60;
const MAX_CLUB_ADMINS         = 3;
const MAX_CLUB_MEMBERS        = 20;
const MAX_VOTES               = 10;


let models;
let settings;
let parser;
let shared;

// generate a random number with lognormal distribution
function lognorm(mean, sd) {
  let norm = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());

  return Math.pow(Math.E, mean + sd * norm);
}

let users   = [];
let postDay = 0;


async function createPost(topic, previous_posts) {
  // 50% posts won't have any reply information, 25% posts will be
  // answers to the previous post, 12.5% posts will be answers to the
  // 2nd last post and so on.
  //
  let reply_id = previous_posts.length - Math.floor(1 / Math.random()) + 1;
  let reply_to = previous_posts[reply_id];

  let md = charlatan.Lorem.paragraphs(charlatan.Helpers.rand(5, 1)).join('\n\n');
  let user = users[charlatan.Helpers.rand(USER_COUNT)];

  let options = await settings.getByCategory('clubs_posts_markup', { usergroup_ids: user.usergroups }, { alias: true });

  let result = await parser.md2html({
    text: md,
    options
  });

  let ts;

  if (previous_posts.length) {
    // Generate random spacing between posts in a large topic,
    // it gives about 10% probability of 7 days interval, and 0.02% probability of 5 years interval
    //
    ts = new Date(+previous_posts[previous_posts.length - 1].ts + lognorm(17, 2.5));
  } else {
    ts = new Date(2010, 0, postDay++);
  }

  let post = new models.clubs.Post({
    _id: new ObjectId(Math.round(ts / 1000)),

    html:    result.html,
    md,

    st:      models.clubs.Post.statuses.VISIBLE,
    topic:   topic._id,
    club:    topic.club,

    user,

    /*eslint-disable new-cap*/
    ip:      charlatan.Internet.IPv4(),

    /*eslint-disable no-undefined*/
    to:      reply_to ? reply_to._id  : undefined,
    to_user: reply_to ? reply_to.user : undefined,
    to_phid: reply_to ? reply_to.hid  : undefined,

    ts
  });

  // params_ref will be generated automatically by the hook,
  // specifying params in constructor doesn't work 'cause params is not in the model
  post.params = options;

  await post.save();

  return post;
}


async function addVotes(post) {
  let votes = 0;

  for (let i = charlatan.Helpers.rand(MAX_VOTES); i > 0; i--) {
    let user = users[charlatan.Helpers.rand(USER_COUNT)];
    let value = Math.random() > 0.5 ? 1 : -1;

    let vote = new models.users.Vote({
      to:     post.user,
      from:   user._id,
      for:  post._id,
      type:   shared.content_type.CLUB_POST,
      value
    });

    votes += value;

    await vote.save();
  }

  await post.updateOne({ votes });
}


async function createTopic(club, post_count) {
  let first_post;
  let last_post;

  let topic = new models.clubs.Topic({
    _id: new ObjectId(Math.round(new Date(2010, 0, postDay) / 1000)),

    title: charlatan.Lorem.sentence().slice(0, -1),

    st: models.clubs.Topic.statuses.OPEN,
    club: club._id,

    views_count: charlatan.Helpers.rand(1000)
  });

  // Save topic to the database before creating posts,
  // it's needed because of Post model hooks
  //
  await topic.save();

  let posts = [];

  for (let i = 0; i < post_count; i++) {
    let post = await createPost(topic, posts);

    if (!first_post) {
      first_post = post;
    }

    last_post = post;

    posts.push(post);

    await addVotes(post);
  }

  topic.cache.post_count    = post_count;

  topic.cache.first_post    = first_post._id;
  topic.cache.first_ts      = first_post.ts;
  topic.cache.first_user    = first_post.user;

  topic.cache.last_post     = last_post._id;
  topic.cache.last_post_hid = last_post.hid;
  topic.cache.last_ts       = last_post.ts;
  topic.cache.last_user     = last_post.user;

  Object.assign(topic.cache_hb, topic.cache);

  // Update cache for this topic
  //
  await topic.save();
}


async function createUsers() {
  let userGroupsByName = {};
  let groups = await models.users.UserGroup.find().select('_id short_name');

  // collect usergroups
  groups.forEach(function (group) {
    userGroupsByName[group.short_name] = group;
  });

  for (let i = 0; i < USER_COUNT; i++) {
    let user = new models.users.User({
      first_name: charlatan.Name.firstName(),
      last_name:  charlatan.Name.lastName(),
      nick:       charlatan.Internet.userName(),
      email:      charlatan.Internet.email(),
      joined_ts:  new Date(),
      joined_ip:  charlatan.Internet.IPv4(),
      usergroups: userGroupsByName.members,
      active:     true
    });

    await user.save();

    // add user to store
    users.push(user);
  }
}


async function createClubs(global_admins) {
  let club_ids = [];

  for (let i = 0; i < TOTAL_CLUB_COUNT; i++) {
    //
    // Get a random sample of users. First couple of them become admins,
    // the rest are regular members.
    //
    // For first clubs add website administrators as members for demo purposes.
    //
    let include_global_admins = (i < SUBSCRIBED_CLUB_COUNT);
    let max_random_members = Math.max(MAX_CLUB_MEMBERS - (include_global_admins ? global_admins.length : 0), 1);
    let members = charlatan.Helpers.shuffle(users).slice(0, charlatan.Helpers.rand(1, max_random_members + 1));
    let admins = members.slice(0, charlatan.Helpers.rand(1, MAX_CLUB_ADMINS + 1));

    members = members.slice(admins.length);

    if (include_global_admins) members = charlatan.Helpers.shuffle(members.concat(global_admins));

    //
    // Create club
    //
    let club = new models.clubs.Club({
      _id:         new ObjectId(Math.round(new Date(2009, 0, 1) / 1000)),
      title:       charlatan.Lorem.sentence(charlatan.Helpers.rand(5, 3)).slice(0, -1),
      created_ts:  new Date(2009, 0, 1),
      description: charlatan.Lorem.paragraphs(charlatan.Helpers.rand(3, 1)).join('\n\n')
    });

    await club.save();

    club_ids.push(club._id);

    //
    // Save membership info
    //
    /*eslint-disable no-loop-func*/
    await Promise.all(admins.map(user =>
      models.clubs.Membership.create({
        club:     club._id,
        user:     user._id,
        is_owner: true
      })
    ));

    await Promise.all(members.map(user =>
      models.clubs.Membership.create({
        club:     club._id,
        user:     user._id,
        is_owner: false
      })
    ));

    await models.clubs.Club.updateMembers(club._id);
  }

  return club_ids;
}


async function updateClubStat(club) {
  await models.clubs.Club.updateCache(club._id);
}


async function createTopics(club_ids) {
  let clubs = await models.clubs.Club.find()
                        .where('_id').in(club_ids)
                        .select('_id cache')
                        .lean(true);

  for (let club of clubs) {
    // create topic with single post
    await createTopic(club, 1);
    await updateClubStat(club);
    postDay += 183; // spread dates more between clubs
  }
}


async function fillBigClub(club_id) {
  let club = await models.clubs.Club.findById(club_id)
                     .select('_id cache')
                     .lean(true);

  for (let i = 0; i < TOPIC_COUNT_IN_BIG_CLUB; i++) {
    await createTopic(club, 1);
  }

  await updateClubStat(club);
}


async function addBigTopic(club_id) {
  let club = await models.clubs.Club.findById(club_id)
                     .select('_id cache')
                     .lean(true);

  await createTopic(club, POST_COUNT_IN_BIG_TOPIC);
  await updateClubStat(club);
}


async function updateUserCounters() {
  await models.clubs.UserTopicCount.recount(users.map(x => x._id));
  await models.clubs.UserPostCount.recount(users.map(x => x._id));
}


module.exports = async function (N) {
  models   = N.models;
  settings = N.settings;
  parser   = N.parser;
  shared   = N.shared;

  // Get administrators group _id
  let adm_group_id = await models.users.UserGroup.findIdByName('administrators');

  let users = await models.users.User.find()
                      .where('usergroups').equals(adm_group_id)
                      .select('_id')
                      .lean(true);

  await createUsers();
  let club_ids = await createClubs(users);
  await createTopics(club_ids.slice(1));
  await fillBigClub(club_ids[0]);
  await addBigTopic(club_ids[0]);
  await updateUserCounters();
};
