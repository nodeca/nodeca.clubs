// Popup dialog to create a club
//
// In:
//  - data.title_max_length
//
'use strict';


let $dialog;
let params;
let result;


N.wire.once(module.apiPath, function init_event_handlers() {

  // Listen submit button
  //
  N.wire.on(module.apiPath + ':submit', function submit_club_create_dlg(data) {
    data.$this.addClass('was-validated');

    if (data.$this[0].checkValidity() === false) return;

    params.title = result = data.fields.club_title;
    $dialog.modal('hide');
  });


  // Close dialog on sudden page exit (if user click back button in browser)
  //
  N.wire.on('navigate.exit', function teardown_page() {
    if ($dialog) {
      $dialog.modal('hide');
    }
  });
});


// Init dialog on event
//
N.wire.on(module.apiPath, function show_club_create_dlg(data) {
  params = data;
  $dialog = $(N.runtime.render('clubs.sole.create', { title_max_length: data.title_max_length }));

  $('body').append($dialog);

  return new Promise((resolve, reject) => {
    $dialog
      .on('hidden.bs.modal', () => {
        // When dialog closes - remove it from body
        $dialog.remove();
        $dialog = null;
        params = null;

        if (result) resolve(result);
        else reject('CANCELED');

        result = null;
      })
      .on('shown.bs.modal', () => {
        $dialog.find('#club_title_dlg_input').focus();
      })
      .modal('show');
  });
});
