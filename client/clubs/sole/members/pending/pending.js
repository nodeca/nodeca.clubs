// Manage pending request list
//

'use strict';


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Approve user membership request
  //
  N.wire.on(module.apiPath + ':accept', function accept(data) {
    let user_id = data.$this.data('user-id');
    let club_id = data.$this.data('club-id');

    return N.io.rpc('clubs.sole.members.pending.accept', { user_id, club_id })
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Reject user membership request
  //
  N.wire.on(module.apiPath + ':reject', function reject(data) {
    let user_id = data.$this.data('user-id');
    let club_id = data.$this.data('club-id');

    return N.io.rpc('clubs.sole.members.pending.reject', { user_id, club_id })
      .then(() => N.wire.emit('navigate.reload'));
  });
});
