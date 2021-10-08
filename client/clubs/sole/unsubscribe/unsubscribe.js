'use strict';


N.wire.on('navigate.done:' + module.apiPath, function unsubscribe() {
  let selector = '.clubs-sole-unsubscribe';
  let type = $(selector).data('type');
  let club_hid = $(selector).data('club-hid');

  return Promise.resolve()
           .then(() => N.io.rpc('clubs.sole.change_subscription', { club_hid, type }))
           .then(() => $(selector).addClass('page-loading__m-done'));
});
