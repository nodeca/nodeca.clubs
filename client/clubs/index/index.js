'use strict';


// Click on "create club" button
//
N.wire.on(module.apiPath + ':create_club', function create_club() {
  let params = { title_max_length: N.runtime.page_data.settings.clubs_club_title_max_length };

  return Promise.resolve()
    .then(() => N.wire.emit('clubs.sole.create', params))
    .then(() => N.io.rpc('clubs.sole.create', { title: params.title }))
    .then(res => N.wire.emit('navigate.to', res.redirect_url));
});
