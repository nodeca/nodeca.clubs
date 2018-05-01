'use strict';

const identicon    = require('nodeca.users/lib/identicon');
const avatarWidth  = '$$ JSON.stringify(N.config.users.avatars.resize.orig.width) $$';
const avatarHeight = '$$ JSON.stringify(N.config.users.avatars.resize.orig.width) $$';

let pageParams;


N.wire.on('navigate.done:' + module.apiPath, function setup_page(data) {
  pageParams = data.params;

  $('#club-edit__title').focus();
});


N.wire.on(module.apiPath + ':save', function save_club(data) {
  data.$this.addClass('was-validated');

  if (data.$this[0].checkValidity() === false) return;

  let fields = Object.assign({}, data.fields);

  if (data.$this[0].avatar.files.length > 0) {
    fields.avatar = data.$this[0].avatar.files[0];
  }

  fields.remove_avatar = Boolean(fields.remove_avatar);

  return N.io.rpc('clubs.sole.edit.update', fields)
    .then(() => N.wire.emit('navigate.to', { apiPath: 'clubs.sole', params: pageParams }));
});


N.wire.on(module.apiPath + ':avatar_change', function avatar_change(data) {
  let reader = new FileReader();

  reader.onload = function (e) {
    let img = $('.club-avatar__image');

    img.attr('src', e.target.result);

    // adjust image offset and size so user will only see the center part,
    // which image will be cropped into on the server
    img.one('load', () => {
      $('.club-avatar').addClass('club-avatar__m-exists');
      $('.club-avatar').closest('form')[0].remove_avatar.value = false;

      img.css('width', 'auto');
      img.css('height', 'auto');

      let width = img.width();
      let height = img.height();

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

      img.css('width', Math.floor(scaleX));
      img.css('height', Math.floor(scaleY));
      img.css('left', Math.floor((scaleX - toWidth) / -2));
      img.css('top', Math.floor((scaleY - toHeight) / -2));
    });
  };

  reader.readAsDataURL(data.$this[0].files[0]);
});


N.wire.on(module.apiPath + ':avatar_remove', function avatar_remove() {
  $('.club-avatar').removeClass('club-avatar__m-exists');
  $('.club-avatar').closest('form')[0].remove_avatar.value = 'yes';
  $('.club-avatar__image').attr('src', identicon($('.club-avatar').closest('form')[0].club_id.value, avatarWidth));
});
