// Fetch images from remote servers and get their size
//
'use strict';


const message_images_fetch = require('nodeca.core/lib/app/message_images_fetch');


module.exports = function (N) {
  N.wire.on('init:jobs', function register_club_post_images_fetch() {
    message_images_fetch(N, {
      task_name: 'club_post_images_fetch',
      rebuild:   id => N.wire.emit('internal:clubs.post_rebuild', id)
                             .then(id => N.queue.club_posts_search_update_by_ids([ id ]).postpone()),
      find:      id => N.models.clubs.Post.findById(id)
    });
  });
};
