'use strict';

const identicon    = require('nodeca.users/lib/identicon');
const avatarWidth  = '$$ JSON.stringify(N.config.users.avatars.resize.orig.width) $$';
const avatarHeight = '$$ JSON.stringify(N.config.users.avatars.resize.orig.width) $$';

let pageParams;
let addFields = {};


N.wire.on('navigate.done:' + module.apiPath, function setup_page(data) {
  pageParams = data.params;
  addFields = {};

  $('#club-edit__title').focus();
});


N.wire.on('navigate.exit:' + module.apiPath, function exit_page() {
  pageParams = null;
  addFields = null;
});


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function club_edit_init_handlers() {
  // Save form
  //
  N.wire.on(module.apiPath + ':save', function save_club(data) {
    data.$this.addClass('was-validated');

    if (data.$this[0].checkValidity() === false) return;

    let fields = Object.assign({}, data.fields, addFields);

    return N.io.rpc('clubs.sole.edit.update', fields)
      .then(() => N.wire.emit('navigate.to', { apiPath: 'clubs.sole', params: pageParams }));
  });


  // User selects new avatar
  //
  N.wire.on(module.apiPath + ':avatar_change', function avatar_change(data) {
    let reader = new FileReader();

    reader.onload = function (e) {
      let img = $('<img class="club-avatar__image">');

      img.attr('src', e.target.result);

      // adjust image offset and size so user will only see the center part,
      // which image will be cropped into on the server
      img[0].onload = () => {
        $('.club-avatar').addClass('club-avatar__m-exists');

        let width = img[0].width;
        let height = img[0].height;

        let toWidth = avatarWidth;
        let toHeight = avatarHeight;

        let scaleX, scaleY;

        if (width / height > toWidth / toHeight) {
          scaleX = width * toHeight / height;
          scaleY = toHeight;
        } else {
          scaleX = toWidth;
          scaleY = height * toWidth / width;
        }

        $('.club-avatar__image').replaceWith(img);

        img.css('width', Math.floor(scaleX));
        img.css('height', Math.floor(scaleY));
        img.css('left', Math.floor((scaleX - toWidth) / -2));
        img.css('top', Math.floor((scaleY - toHeight) / -2));

        addFields = { avatar: $('.club-avatar').closest('form')[0].avatar.files[0] };
      };

      img[0].onerror = () => {
        N.wire.emit('notify', t('err_bad_image'));
      };
    };

    reader.readAsDataURL(data.$this[0].files[0]);
  });


  // User removes existing avatar
  //
  N.wire.on(module.apiPath + ':avatar_remove', function avatar_remove() {
    $('.club-avatar').removeClass('club-avatar__m-exists');
    $('.club-avatar__image').attr('src', identicon($('.club-avatar').closest('form')[0].club_id.value, avatarWidth));
    addFields = { remove_avatar: true };
  });
});
