'use strict';


// Execute search if it's defined in query, show user's clubs otherwise
//
N.wire.on('navigate.done:' + module.apiPath, function page_init() {
  let query = N.runtime.page_data.query;

  N.io.rpc('clubs.search.list.results', { query }).then(function (res) {
    return N.wire.emit('navigate.update', {
      $: $(N.runtime.render(module.apiPath + '.list', res)),
      locals: res,
      $replace: $('.clubs-search__club-list')
    });
  }).catch(err => {
    if (err.code === N.io.CLIENT_ERROR) {
      let res = { error: err.message };

      return N.wire.emit('navigate.update', {
        $: $(N.runtime.render(module.apiPath + '.list', res)),
        locals: res,
        $replace: $('.clubs-search__club-list')
      });
    }

    N.wire.emit('error', err);
  });
});


// Click on "create club" button
//
N.wire.on(module.apiPath + ':create_club', function create_club() {
  let params = { title_max_length: N.runtime.page_data.settings.clubs_club_title_max_length };

  return Promise.resolve()
    .then(() => N.wire.emit('clubs.sole.create', params))
    .then(() => N.io.rpc('clubs.sole.create', { title: params.title }))
    .then(res => N.wire.emit('navigate.to', res.redirect_url));
});
