'use strict';


module.exports.up = async function (N) {
  let usergroupStore = N.settings.getStore('usergroup');

  // add usergroup settings for admin

  let adminGroupId = await N.models.users.UserGroup.findIdByName('administrators');

  await usergroupStore.set({
    clubs_can_create_clubs:                { value: true },
    clubs_can_join_clubs:                  { value: true },
    clubs_can_reply:                       { value: true },
    clubs_can_start_topics:                { value: true },
    //clubs_can_close_topic:                 { value: true },
    //clubs_lead_can_pin_topic:              { value: true },
    //clubs_lead_can_edit_posts:             { value: true },
    //clubs_lead_can_delete_topics:          { value: true },
    //clubs_lead_can_edit_titles:            { value: true },
    //clubs_lead_can_close_topic:            { value: true },
    clubs_lead_can_edit_clubs:             { value: true },
    clubs_lead_can_edit_club_members:      { value: true },
    clubs_lead_can_edit_club_owners:       { value: true },

    // admin permissions
    clubs_show_ignored:                    { value: true },
    clubs_mod_can_pin_topic:               { value: true },
    clubs_mod_can_edit_posts:              { value: true },
    clubs_mod_can_delete_topics:           { value: true },
    clubs_mod_can_hard_delete_topics:      { value: true },
    clubs_mod_can_see_hard_deleted_topics: { value: true },
    clubs_mod_can_edit_titles:             { value: true },
    clubs_mod_can_close_topic:             { value: true },
    clubs_mod_can_edit_clubs:              { value: true },
    clubs_mod_can_edit_club_members:       { value: true },
    clubs_mod_can_edit_club_owners:        { value: true },
    clubs_mod_can_add_infractions:         { value: true }
  }, { usergroup_id: adminGroupId });

  // add usergroup settings for members

  let memberGroupId = await N.models.users.UserGroup.findIdByName('members');

  await usergroupStore.set({
    clubs_can_create_clubs:                { value: true },
    clubs_can_join_clubs:                  { value: true },
    clubs_can_reply:                       { value: true },
    clubs_can_start_topics:                { value: true },
    //clubs_can_close_topic:                 { value: true },
    //clubs_lead_can_pin_topic:              { value: true },
    //clubs_lead_can_edit_posts:             { value: true },
    //clubs_lead_can_delete_topics:          { value: true },
    //clubs_lead_can_edit_titles:            { value: true },
    //clubs_lead_can_close_topic:            { value: true },
    clubs_lead_can_edit_clubs:             { value: true },
    clubs_lead_can_edit_club_members:      { value: true },
    clubs_lead_can_edit_club_owners:       { value: true }
  }, { usergroup_id: memberGroupId });

  // add usergroup settings for violators
  //
  // note: it is a modifier group added to users in addition to their
  //       existing usergroups, thus we should turn "force" flag on

  let violatorsGroupId = await N.models.users.UserGroup.findIdByName('violators');

  await usergroupStore.set({
    clubs_can_create_clubs:           { value: false, force: true },
    clubs_can_join_clubs:             { value: false, force: true },
    clubs_can_reply:                  { value: false, force: true },
    clubs_can_start_topics:           { value: false, force: true },
    clubs_can_close_topic:            { value: false, force: true },
    clubs_lead_can_pin_topic:         { value: false, force: true },
    clubs_lead_can_edit_posts:        { value: false, force: true },
    clubs_lead_can_delete_topics:     { value: false, force: true },
    clubs_lead_can_edit_titles:       { value: false, force: true },
    clubs_lead_can_close_topic:       { value: false, force: true },
    clubs_lead_can_edit_clubs:        { value: false, force: true },
    clubs_lead_can_edit_club_members: { value: false, force: true },
    clubs_lead_can_edit_club_owners:  { value: false, force: true },
    clubs_edit_max_time:              { value: 0, force: true }
  }, { usergroup_id: violatorsGroupId });

  // add usergroup settings for banned

  let bannedGroupId = await N.models.users.UserGroup.findIdByName('banned');

  await usergroupStore.set({
    clubs_edit_max_time: { value: 0 }
  }, { usergroup_id: bannedGroupId });
};
