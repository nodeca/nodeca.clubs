// Manage block list
//

'use strict';


const _ = require('lodash');


let bloodhound;


// Load dependencies
//
N.wire.before('navigate.done:' + module.apiPath, function load_deps() {
  return N.loader.loadAssets([ 'vendor.typeahead' ]);
});


// Initialize form
//
N.wire.on('navigate.done:' + module.apiPath, function init_user_input() {
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
  $('#clubs-sole-members-add-block').typeahead({ highlight: true }, {
    source: bloodhound.ttAdapter(),
    display: 'nick',
    templates: {
      suggestion(user) {
        return '<div>' + _.escape(user.name) + '</div>';
      }
    }
  });
});
