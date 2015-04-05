(function () {
  'use strict';

  var coberturaBadger = require('istanbul-cobertura-badger');

  var coberturaFile = 'test/coverage/cobertura-coverage.xml';
  var destinationPath = 'test/';

  coberturaBadger(coberturaFile, destinationPath, function () {
    console.log('Badge created at %s/cobertura.svg', coberturaFile);
  });
})();
