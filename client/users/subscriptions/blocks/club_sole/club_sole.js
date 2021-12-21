'use strict';


N.wire.on('users.subscriptions.club_sole:mark_tab_read', function mark_tab_read() {
  return N.io.rpc('clubs.mark_read', { ts: N.runtime.page_data.mark_cut_ts })
             .then(() => N.wire.emit('navigate.reload'));
});
