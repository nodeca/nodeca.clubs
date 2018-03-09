'use strict';


module.exports.up = async function (N) {
  let usergroupStore = N.settings.getStore('usergroup');

  // add usergroup settings for admin

  let adminGroupId = await N.models.users.UserGroup.findIdByName('administrators');

  await usergroupStore.set({
    clubs_mod_can_delete_topics:           { value: true },
    clubs_mod_can_hard_delete_topics:      { value: true },
    clubs_mod_can_see_hard_deleted_topics: { value: true },
    clubs_mod_can_add_infractions:         { value: true }
  }, { usergroup_id: adminGroupId });
};
