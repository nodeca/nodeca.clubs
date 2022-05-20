// Create new topic
//
// data:
//
// - club_hid
// - club_title
//
'use strict';


const _ = require('lodash');


let options;


function updateOptions() {
  N.MDEdit.parseOptions(Object.assign({}, options.parse_options, {
    link_to_title:   options.user_settings.no_mlinks         ? false : options.parse_options.link_to_title,
    link_to_snippet: options.user_settings.no_mlinks         ? false : options.parse_options.link_to_snippet,
    quote_collapse:  options.user_settings.no_quote_collapse ? false : options.parse_options.quote_collapse,
    emoji:           options.user_settings.no_emojis         ? false : options.parse_options.emoji,
    breaks:          options.user_settings.breaks            ? true  : options.parse_options.breaks
  }));
}


// Load mdedit
//
N.wire.before(module.apiPath + ':begin', function load_mdedit() {
  return N.loader.loadAssets('mdedit');
});


// Fetch options
//
N.wire.before(module.apiPath + ':begin', function fetch_options() {
  return N.io.rpc('clubs.topic.post.options').then(opt => {
    options = {
      parse_options: opt.parse_options,
      user_settings: {
        no_mlinks:         opt.user_settings.no_mlinks,
        no_emojis:         opt.user_settings.no_emojis,
        no_quote_collapse: opt.user_settings.no_quote_collapse,
        breaks:            opt.user_settings.breaks
      }
    };
  });
});


// Show editor and add handlers for editor events
//
N.wire.on(module.apiPath + ':begin', function show_editor(data) {
  let $editor = N.MDEdit.show({
    draftKey: `clubs_topic_create_${N.runtime.user_hid}_${data.club_hid}`,
    draftCustomFields: {
      '.clubs-topic-create__title': 'input'
    }
  });

  updateOptions();

  $editor
    .on('show.nd.mdedit', () => {
      let title = t('create_topic', {
        club_url: N.router.linkTo('clubs.sole', { club_hid: data.club_hid }),
        club_title: _.escape(data.club_title)
      });

      $editor.find('.mdedit-header__caption').html(title);
      $editor.find('.mdedit-header').append(N.runtime.render(module.apiPath + '.title_input'));

      $editor.find('.mdedit-footer').append(N.runtime.render(module.apiPath + '.options_btn'));
    })
    .on('submit.nd.mdedit', () => {
      $editor.find('.mdedit-btn__submit').addClass('disabled');

      let params = {
        club_hid:                 data.club_hid,
        title:                    $('.clubs-topic-create__title').val(),
        txt:                      N.MDEdit.text(),
        option_no_mlinks:         options.user_settings.no_mlinks,
        option_no_emojis:         options.user_settings.no_emojis,
        option_no_quote_collapse: options.user_settings.no_quote_collapse,
        option_breaks:            options.user_settings.breaks
      };

      N.io.rpc('clubs.topic.create', params).then(response => {
        N.MDEdit.hide({ removeDraft: true });
        N.wire.emit('navigate.to', {
          apiPath: 'clubs.topic',
          params: {
            club_hid:  data.club_hid,
            topic_hid: response.topic_hid,
            post_hid:  response.post_hid
          }
        });
      }).catch(err => {
        $editor.find('.mdedit-btn__submit').removeClass('disabled');
        N.wire.emit('error', err);
      });

      return false;
    });
});


// Open options dialog
//
N.wire.on(module.apiPath + ':options', function show_options_dlg() {
  return N.wire.emit('common.blocks.editor_options_dlg', options.user_settings)
    .then(updateOptions)
    .then(() => N.io.rpc('users.set_md_options', options.user_settings));
});
