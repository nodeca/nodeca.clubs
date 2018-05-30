// Manage club owners
//

'use strict';


const _ = require('lodash');


let bloodhound;
let pageParams;


// Load dependencies
//
N.wire.before('navigate.done:' + module.apiPath, function load_deps() {
  return N.loader.loadAssets([ 'vendor.typeahead' ]);
});


// Initialize form
//
N.wire.on('navigate.done:' + module.apiPath, function init_user_input(data) {
  pageParams = data.params;

  const Bloodhound = require('corejs-typeahead/dist/bloodhound.js');

  // If bloodhound not initialized - init
  //
  if (!bloodhound) {
    bloodhound = new Bloodhound({
      remote: {
        url: 'unused', // bloodhound throws if it's not defined
        prepare(nick) { return nick; },
        // Reroute request to rpc
        transport(req, onSuccess, onError) {
          N.io.rpc('common.user_lookup', { nick: req.url })
            .then(onSuccess)
            .catch(onError);
        }
      },
      datumTokenizer(d) {
        return Bloodhound.tokenizers.whitespace(d.nick);
      },
      queryTokenizer: Bloodhound.tokenizers.whitespace
    });

    bloodhound.initialize();
  }


  // Bind typeahead to nick field
  //
  $('#clubs-sole-members-add-owner').typeahead({ highlight: true }, {
    source: bloodhound.ttAdapter(),
    display: 'nick',
    templates: {
      suggestion(user) {
        return '<div>' + _.escape(user.name) + '</div>';
      }
    }
  });
});


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Make another user an owner
  //
  N.wire.on(module.apiPath + ':add', function add_owner(data) {
    data.$this.addClass('was-validated');
    if (data.$this[0].checkValidity() === false) return;

    return N.io.rpc('clubs.sole.members.owners.add', data.fields)
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Ask for confirmation when revoking permissions from a confirmed owner,
  // don't ask anything for pending requests
  //
  N.wire.before(module.apiPath + ':remove', function old_reply_confirm(data) {
    let is_oneself = data.$this.data('is-oneself');
    let is_pending = data.$this.data('is-pending');

    if (is_pending) return;

    return N.wire.emit('common.blocks.confirm', is_oneself ? t('revoke_own_confirm') : t('revoke_confirm'));
  });


  // Cancel ownership status of yourself or another user,
  // or cancel ownership request to another user
  //
  N.wire.on(module.apiPath + ':remove', function remove_owner(data) {
    let is_oneself = data.$this.data('is-oneself');
    let nick       = data.$this.data('user-nick');
    let club_id    = data.$this.data('club-id');

    return N.io.rpc('clubs.sole.members.owners.remove', { nick, club_id })
      .then(() => {
        if (is_oneself) {
          return N.wire.emit('navigate.to', {
            apiPath: 'clubs.sole',
            params: { club_hid: pageParams.club_hid }
          });
        }

        return N.wire.emit('navigate.reload');
      });
  });
});
