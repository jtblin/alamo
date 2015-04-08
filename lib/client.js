(function () {
  'use strict';

  var http = require('http');
  var XML = require('simple-xml');
  var retry = require('retry-me');
  var md5 = require('crypto-md5');
  var es = require('event-stream');
  var debug = require('debug')('alamo:client');
  var extend = require('extend').bind(null, true);

  module.exports = Client;

  /**
   * Initialize a `Client` with the given knox `client` and `options`.
   *
   * @param {Object} client   knox client
   * @param {Object} opts     Client options
   * @api private             Use index.createClient
   */
  function Client (client, opts) {
    this.client = client;
    this.opts = extend({
      retries: 10,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 60 * 1000
    }, opts);
  }

  /**
   * Create a readable stream  with `filename` the given `method`, and optional `headers` and `options`.
   *
   * @param {String} filename Filename
   * @param {Object} headers  Optional request headers
   * @param {Object} options  Client options
   * @return {Stream}
   */
  Client.prototype.createReadStream = function (filename, headers, options) {
    return this.stream('GET', filename, headers, '', options);
  };

  /**
   * Create a writable stream  with `filename` the given `method`, and optional `headers` and `options`.
   *
   * @param {String} filename Filename
   * @param {Object} headers  Optional request headers
   * @param {Object} buffer   Optional buffer or string to upload
   * @param {Object} options  Client options
   * @return {Stream}
   */
  Client.prototype.createWriteStream = function (filename, headers, buffer, options) {
    return this.stream('PUT', filename, headers, buffer, options);
  };

  /**
   * GET Request with `filename` the given `method`, and optional `headers` and `options`.
   *
   * @param {String} filename Filename
   * @param {Object} headers  Optional request headers
   * @param {Object} options  Client options
   * @param {Function} cb     Callback
   */
  Client.prototype.get = function (filename, headers, options, cb) {
    this.request('GET', filename, headers, null, options, cb);
  };

  /**
   * DELETE Request with `filename` the given `method`, and optional `headers` and `options`.
   *
   * @param {String} filename Filename
   * @param {Object} headers  Optional request headers
   * @param {Object} options  Client options
   * @param {Function} cb     Callback
   */
  Client.prototype.del = function (filename, headers, options, cb) {
    this.request('DELETE', filename, headers, null, options, cb);
  };

  /**
   * PUT Request with `filename` the given `method`, the `buffer` and optional `headers` and `options`.
   *
   * @param {String} filename Filename
   * @param {Object} buffer   Buffer or string to upload
   * @param {Object} headers  Optional request headers
   * @param {Object} options  Client options
   * @param {Function} cb     Callback
   */
  Client.prototype.put = function (filename, buffer, headers, options, cb) {
    this.request('PUT', filename, headers, buffer, options, cb);
  };

  /**
   * POST Request with `filename` the given `method`, the `buffer` and optional `headers` and `options`.
   *
   * @param {String} filename Filename
   * @param {Object} buffer   Buffer or string to upload
   * @param {Object} headers  Optional request headers
   * @param {Object} options  Client options
   * @param {Function} cb     Callback
   */
  Client.prototype.post = function (filename, buffer, headers, options, cb) {
    this.request('POST', filename, headers, buffer, options, cb);
  };

  /**
   * Returns a signed url with `filename` for the given `expiration`, and `options`.
   *
   * @param {String} filename    Filename
   * @param {Number} expiration  Number of milliseconds
   * @param {Object} options     s3 options
   * @return {String}
   */
  Client.prototype.signedUrl = function (filename, expiration, options) {
    return this.client.signedUrl(filename, new Date(Date.now() + expiration), options);
  };

  /**
   * Stream request with `filename` the given `method`, and optional `headers`, `buffer` and `options`.
   *
   * @param {String} method   Http method
   * @param {String} filename Filename
   * @param {Object} headers  Optional request headers
   * @param {Object} buffer   Optional buffer or string to upload
   * @param {Object} options  Client options
   * @return {Stream}
   * @api private
   */
  Client.prototype.stream = function (method, filename, headers, buffer, options) {
    var client = this.client;
    headers = headers || {};
    if (buffer) {
      headers['content-length'] = buffer.length;
      headers['content-md5'] = md5(buffer);
    }
    var stream = es.through();
    retry(request, extend({}, this.opts, options), function (err, res) {
      if (err) return stream.emit('error', err);
      if (emptyBody(res)) stream.emit('finish', res);
      else res.pipe(stream);
    });
    return stream;

    function request (cb) {
      var req = client.request(method, filename, headers);
      req.on('response', function (res) {
        debug('%s response status %s and body length %d', method, res.statusCode, contentLength(res));
        parseStatus(res, function (err, res) {
          if (! err) return cb(null, res);
          debug('request error', err);
          if (shouldRetry(err)) return stream.emit('error', err); // bypass retry
          cb(err);
        });
      });
      req.on('error', cb);
      if (typeof buffer === 'undefined') stream.pipe(req);
      else req.end(buffer);
    }
  };

  function emptyBody (res) {
    return typeof res.headers['content-length'] !== 'undefined' &&  contentLength(res) === 0;
  }

  function contentLength (res) {
    return res.headers['content-length']|0;
  }

  function parseStatus (res, cb) {
    if (res.statusCode < 300) return cb(null, res);
    var error = new Error;
    error.status = res.statusCode;
    error.message = http.STATUS_CODES[error.status];
    if (emptyBody(res)) return cb(error);
    parseBody(res, function (err, res) {
      if (err) return cb(error);
      try {
        var body = XML.parse(res.body).Error;
        error.code = body.Code;
        error.message = body.Message;
        error.requestId = body.RequestId;
        error.hostId = body.HostId;
        error.key = body.Key;
      } catch (err2) {
        debug('Error parsing error body', err2.message);
      } finally {
        cb(error);
      }
    });
  }

  function parseBody (stream, cb) {
    stream.on('data', function (chunk) {
      stream.body = stream.body ? Buffer.concat([stream.body, chunk], stream.body.length + chunk.length) : chunk;
    });
    stream.on('error', cb);
    stream.on('end', function () {
      cb(null, stream);
    });
  }

  function shouldRetry (err) {
    return err.status >= 400 && err.status !== 404;
  }

  /**
   * Request with `filename` the given `method`, and optional `headers`, `buffer` and `options`.
   *
   * @param {String} method   Http method
   * @param {String} filename Filename
   * @param {Object} headers  Optional request headers
   * @param {Object} buffer   Optional buffer or string to upload
   * @param {Object} options  Client options
   * @param {Function} cb     Callback
   * @api private
   */
  Client.prototype.request = function (method, filename, headers, buffer, options, cb) {
    if (typeof headers === 'function') {
      cb = headers;
      headers = {};
    } else if (typeof buffer === 'function') {
      cb = buffer;
      buffer = void 0;
    } else if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    var req = this.stream(method, filename, headers, buffer, options);
    req.on('pipe', parseBody.bind(null, req, cb));
    req.on('finish', cb.bind(null, null));
    req.on('error', cb);
  };
})();
