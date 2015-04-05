(function () {
  'use strict';

  var Client = require('./lib/client');
  require('./lib/multipart');

  /**
   * Initialize a `Client` with the given `options`.
   *
   * Required:
   *
   *  - `key`     amazon api key
   *  - `secret`  amazon secret
   *  - `bucket`  bucket name string
   *
   * @param {Object} opts
   * @api public
   */
  exports.createClient = function (opts) {
    var client = require('knox').createClient(opts);
    return new Client(client, opts);
  };

})();
