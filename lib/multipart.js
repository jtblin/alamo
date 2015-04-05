(function () {
  'use strict';

  var Stream = require('stream');
  var XML = require('simple-xml');
  var Client = require('./client');
  var queue = require('queue-async');
  var format = require('util').format;
  var debug = require('debug')('alamo:multipart');

  // Minimum 5MB per chunk (except the last part) http://docs.aws.amazon.com/AmazonS3/latest/API/mpUploadComplete.html
  var MPU_PART_SIZE = 1024 * 1024 * 5;

  /**
   * Create a multi part upload writable stream  with `filename`, and optional `headers` and `options`.
   *
   * @param {String} filename Filename
   * @param {Object} headers  Optional request headers
   * @param {Object} options  Client options
   * @return {Stream}
   */
  Client.prototype.multipart = function (filename, headers, options) {
    headers = headers || {};
    options = options || {};
    var self = this;
    var ws = new Stream;
    ws.writable = true;
    ws.bytes = 0;
    var partNum = 0;
    ws.buffer = new Buffer(MPU_PART_SIZE);
    ws.uploads = queue(options.concurrency || 10);
    ws.write = writeBuffer;
    ws.end = endStream;

    initiateUpload();
    ws.on('finish', function () { debug('all uploads are complete'); });
    return ws;

    function initiateUpload () {
      self.post(format('%s?uploads', filename), '', headers, options, function (err, res) {
        if (err) return ws.emit('error', err);
        try {
          var body = XML.parse(res.body).InitiateMultipartUploadResult;
          if (! body || ! body.UploadId) return ws.emit('error', new Error('Invalid upload id'));
          ws.uploadId = body.UploadId;
          ws.emit('init', ws.uploadId);
          debug('upload initiated', ws.uploadId);
        } catch (err) {
          ws.emit('error', err);
        }
      });
    }

    function writeBuffer (buf/*, enc, cb*/) {
      var buffLength = (buf && buf.length) | 0;
      if (buffLength) {
        if (ws.bytes + buffLength >= MPU_PART_SIZE) {
          var newBuffer = new Buffer(ws.bytes + buffLength);
          ws.buffer.copy(newBuffer, 0, 0, ws.bytes);
          ws.buffer = newBuffer;
          ws.bytes += copyBuffer(buf, ws.buffer, ws.bytes, 0, buffLength);
          ws.uploads.defer(uploadPart, ws.buffer);
          ws.bytes = 0;
          ws.buffer = new Buffer(MPU_PART_SIZE);
        } else {
          ws.bytes += copyBuffer(buf, ws.buffer, ws.bytes, 0, buffLength);
        }
      }
      return true;
    }

    function copyBuffer (source, target, targetStart, sourceStart, sourceEnd) {
      source.copy(target, targetStart, sourceStart, sourceEnd);
      return sourceEnd - sourceStart;
    }

    function endStream () {
      if (ws.bytes > 0) ws.uploads.defer(uploadPart, ws.buffer.slice(0, ws.bytes));
      ws.uploads.awaitAll(function (err, results) {
        if (! err) return completeUpload(results); // complete only when all parts are uploaded
        ws.emit('error', err);
        abortUpload();
      });
    }

    function uploadPart (part, cb) {
      // wait until we get an id for the upload from initiate
      if (! ws.uploadId) return ws.on('init', uploadPart.bind(null, part, cb));
      var partId = ++partNum;
      debug('part %d uploading %d bytes for %s', partId, part.length, filename);
      var key = format('%s&partNumber=%d', uploadUrl(filename, ws.uploadId), partId);
      self.put(key, part, {}, options, function (err, res) {
        if (err) return cb(err);
        debug('part %d uploaded for %s with status %s and etag %s', partId, filename, res.statusCode, res.headers.etag);
        cb(null, { id: partId, etag: res.headers.etag });
      });
    }

    function completeUpload (parts) {
      parts = parts
        .sort(function (a, b) { return a.id > b.id; })
        .map(function (value) { return xmlPart(value.id, value.etag); })
        .join('');

      var content = format('<CompleteMultipartUpload>%s</CompleteMultipartUpload>', parts);
      debug('complete upload', content);
      self.post(uploadUrl(filename, ws.uploadId), content, {}, options, function (err, res) {
        if (err) return ws.emit('error', err);
        ws.emit('finish', res);
      });
    }

    function xmlPart (id, etag) {
      return format('<Part><PartNumber>%d</PartNumber><ETag>%s</ETag></Part>', id, etag);
    }

    function abortUpload () {
      self.stream('DELETE', uploadUrl(filename, ws.uploadId)).on('error', debug);
    }

    function uploadUrl (filename, uploadId) {
      return format('%s?uploadId=%s', filename, uploadId);
    }
  };
})();
