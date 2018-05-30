// Manage member list
//

'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Kick user from the club
  //
  N.wire.on(module.apiPath + ':kick', function kick(data) {
    let user_id = data.$this.data('user-id');
    let club_id = data.$this.data('club-id');

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('kick_confirm')))
      .then(() => N.io.rpc('clubs.sole.members.kick', { user_id, club_id }))
      .then(() => N.wire.emit('navigate.reload'));
  });

  // Add user to block list
  //
  N.wire.on(module.apiPath + ':block', function add_block(data) {
    let nick = data.$this.data('user-nick');
    let club_id = data.$this.data('club-id');

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('block_confirm')))
      .then(() => N.io.rpc('clubs.sole.members.blocked.add', { nick, club_id }))
      .then(() => N.wire.emit('navigate.reload'));
  });
});