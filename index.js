'use strict';

exports.root = __dirname;
exports.name = 'nodeca.clubs';
exports.init = function (N) { require('./lib/autoload.js')(N); };
