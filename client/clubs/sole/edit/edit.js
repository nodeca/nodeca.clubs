'use strict';

let pageParams;


N.wire.on('navigate.done:' + module.apiPath, function setup_page(data) {
  pageParams = data.params;

  $('#club-edit__title').focus();
});


N.wire.on(module.apiPath + ':save', function save_club(data) {
  data.$this.addClass('was-validated');

  if (data.$this[0].checkValidity() === false) return;

  return N.io.rpc('clubs.sole.edit.update', data.fields)
    .then(() => N.wire.emit('navigate.to', { apiPath: 'clubs.sole', params: pageParams }));
});
