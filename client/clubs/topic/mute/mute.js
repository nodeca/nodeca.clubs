'use strict';


N.wire.on('navigate.done:' + module.apiPath, function unsubscribe() {
  let selector = '.clubs-topic-mute';
  let type = $(selector).data('type');
  let topic_hid = $(selector).data('topic-hid');

  return Promise.resolve()
           .then(() => N.io.rpc('clubs.topic.change_subscription', { topic_hid, type }))
           .then(() => $(selector).addClass('page-loading__m-done'));
});
