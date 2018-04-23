// When user does any action only allowed for members, show this dialog
// and proceed if user agrees to become a member.
//

'use strict';


let $dialog;
let confirmed;


N.wire.once(module.apiPath, function init_handlers() {

  // Pressed 'Join' button
  //
  N.wire.on(module.apiPath + ':confirm', function confirm_ok() {
    confirmed = true;
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


N.wire.on(module.apiPath, function confirm(data) {
  confirmed = false;
  $dialog = $(N.runtime.render(module.apiPath, data));
  $('body').append($dialog);

  return new Promise((resolve, reject) => {
    $dialog
      .on('shown.bs.modal', function () {
        $dialog.find('.btn-secondary').focus();
      })
      .on('hidden.bs.modal', function () {
        $dialog.remove();
        $dialog = null;

        if (confirmed) {
          N.io.rpc('clubs.sole.join', { club_hid: data.club_hid })
              .then(() => N.wire.emit('notify.info', t('result_success')))
              .then(resolve, reject);
        } else {
          reject('CANCELED');
        }
      })
      .modal('show');
  });
});
