'use strict';

const identicon    = require('nodeca.users/lib/identicon');

// Pica instance
let pica;

// Reducer instance
let image_blob_reduce;

// Promise that waits for image-blob-reduce dependency to load
let waitForReduce;

// Avatar size config
const avatarWidth = '$$ N.config.users.avatars.resize.orig.width $$';
const avatarHeight = '$$ N.config.users.avatars.resize.orig.height $$';

let pageParams;
let addFields = {};


N.wire.on('navigate.done:' + module.apiPath, function setup_page(data) {
  pageParams = data.params;
  addFields = {};

  $('#club-edit__title').focus();

  waitForReduce = N.loader.loadAssets('vendor.image-blob-reduce');
});


N.wire.on('navigate.exit:' + module.apiPath, function exit_page() {
  pageParams = null;
  addFields = null;
});


// Load image from user's file
//
function loadImage(file) {
  image_blob_reduce = image_blob_reduce || require('image-blob-reduce')();

  image_blob_reduce.to_canvas(file).then(canvas => {
    let width = canvas.width, height = canvas.height;

    if (width < avatarWidth || height < avatarHeight) {
      N.wire.emit('notify', t('err_invalid_size', { w: avatarWidth, h: avatarHeight }));
      return;
    }

    let avatarRatio = avatarWidth / avatarHeight;

    let toWidth, toHeight;

    if (width / height > avatarRatio) {
      toWidth = height * avatarRatio;
      toHeight = height;
    } else {
      toWidth = width;
      toHeight = width / avatarRatio;
    }

    let leftOffset = (width - toWidth) / 2;
    let topOffset = (height - toHeight) / 2;

    // Create offscreen cropped canvas
    let canvasCropped = document.createElement('canvas');

    canvasCropped.width  = toWidth;
    canvasCropped.height = toHeight;

    let ctxCropped = canvasCropped.getContext('2d');

    ctxCropped.drawImage(canvas, leftOffset, topOffset, toWidth, toHeight, 0, 0, width, height);

    //
    // Resize image
    //
    pica = pica || require('image-blob-reduce').pica();

    // Create "final" avatar canvas
    let avatarCanvas = document.createElement('canvas');

    avatarCanvas.width = avatarWidth;
    avatarCanvas.height = avatarHeight;

    return pica.resize(canvasCropped, avatarCanvas, {
      unsharpAmount: 80,
      unsharpRadius: 0.6,
      unsharpThreshold: 2
    })
    .then(() => pica.toBlob(avatarCanvas, 'image/jpeg', 90))
    .then(function (blob) {
      let img = $('<img class="club-avatar__image">');
      img.attr('src', window.URL.createObjectURL(blob));
      $('.club-avatar__image').replaceWith(img);
      $('.club-avatar').addClass('club-avatar__m-exists');
      addFields = { avatar: blob };
    })
    .catch(() => {
      N.wire.emit('notify', t('err_image_invalid'));
      throw 'CANCELED';
    });
  });
}


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
    let files = data.$this[0].files;
    if (files.length > 0) {
      let avatar = files[0];
      waitForReduce
        .then(() => loadImage(avatar))
        .catch(err => N.wire.emit('error', err));
    }
    // reset input, so uploading the same file again will trigger 'change' event
    data.$this.val('');
  });


  // User removes existing avatar
  //
  N.wire.on(module.apiPath + ':avatar_remove', function avatar_remove() {
    $('.club-avatar').removeClass('club-avatar__m-exists');
    $('.club-avatar__image').attr('src', identicon($('.club-avatar').closest('form')[0].club_id.value, avatarWidth));
    addFields = { remove_avatar: true };
  });


  // User removes existing location
  //
  N.wire.on(module.apiPath + ':location_remove', function location_remove() {
    $('.club-edit-location').addClass('club-edit-location__m-removed');
    addFields = { remove_location: true };
  });
});
