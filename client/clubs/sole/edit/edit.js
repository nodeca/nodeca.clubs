'use strict';

const identicon    = require('nodeca.users/lib/identicon');
const filter_jpeg  = require('nodeca.users/lib/filter_jpeg');

// Pica instance
let pica;

// Promise that waits for pica dependency to load
let waitForPica;

// Original image
let image;

// Avatar size config
const avatarWidth = '$$ N.config.users.avatars.resize.orig.width $$';
const avatarHeight = '$$ N.config.users.avatars.resize.orig.height $$';

let pageParams;
let addFields = {};


N.wire.on('navigate.done:' + module.apiPath, function setup_page(data) {
  pageParams = data.params;
  addFields = {};

  $('#club-edit__title').focus();

  waitForPica = N.loader.loadAssets('vendor.pica');
});


N.wire.on('navigate.exit:' + module.apiPath, function exit_page() {
  pageParams = null;
  addFields = null;
});


// Apply JPEG orientation to canvas. Define flip/rotate transformation
// on context and swap canvas width/height if needed
//
function orientationApply(canvas, ctx, orientation) {
  let width = canvas.width;
  let height = canvas.height;

  if (!orientation || orientation > 8) return;

  if (orientation > 4) {
    ctx.canvas.width = height;
    ctx.canvas.height = width;
  }

  switch (orientation) {

    case 2:
      // Horizontal flip
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      break;

    case 3:
      // rotate 180 degrees left
      ctx.translate(width, height);
      ctx.rotate(Math.PI);
      break;

    case 4:
      // Vertical flip
      ctx.translate(0, height);
      ctx.scale(1, -1);
      break;

    case 5:
      // Vertical flip + rotate right
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;

    case 6:
      // Rotate right
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -height);
      break;

    case 7:
      // Horizontal flip + rotate right
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(width, -height);
      ctx.scale(-1, 1);
      break;

    case 8:
      // Rotate left
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-width, 0);
      break;

    default:
  }
}


// Load image from user's file
//
function loadImage(file) {
  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  let orientation;

  image = new Image();

  image.onerror = () => { N.wire.emit('notify', t('err_image_invalid')); };

  image.onload = () => {

    if (image.width < avatarWidth || image.height < avatarHeight) {
      N.wire.emit('notify', t('err_invalid_size', { w: avatarWidth, h: avatarHeight }));
      return;
    }

    canvas.width  = image.width;
    canvas.height = image.height;

    orientationApply(canvas, ctx, orientation);

    ctx.drawImage(image, 0, 0, image.width, image.height);

    let width = canvas.width, height = canvas.height;

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
    pica = pica || require('pica')();

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
  };

  let reader = new FileReader();

  reader.onloadend = e => {
    // only keep comments and exif in header
    let filter = filter_jpeg({
      onIFDEntry: function readOrientation(ifd, entry) {
        if (ifd === 0 && entry.tag === 0x112 && entry.type === 3) {
          orientation = this.readUInt16(entry.value, 0);
        }
      }
    });

    try {
      filter.push(new Uint8Array(e.target.result));
      filter.end();
    } catch (err) {
      N.wire.emit('notify', t('err_image_invalid'));
      return;
    }

    image.src = window.URL.createObjectURL(file);
  };

  reader.readAsArrayBuffer(file);
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
      waitForPica
        .then(() => loadImage(files[0]))
        .catch(err => N.wire.emit('error', err));
    }
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
