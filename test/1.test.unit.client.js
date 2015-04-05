(function () {
  'use strict';

  describe('client', function () {
    var client;
    var alamo = require('../');
    var knox = require('knox');
    var Stream = require('stream');
    var format = require('util').format;

    beforeEach(function () {
      client = alamo.createClient({
        key: 'AWS_ACCESS_KEY_ID',
        secret: 'AWS_SECRET_ACCESS_KEY',
        bucket: 'AWS_BUCKET'
      });
    });

    describe('#createClient', function () {
      it('creates an s3 client', function () {
        var mock = sandbox.mock(knox);
        mock.expects('createClient').withExactArgs({ foo: 'bar' }).returns({});
        var client = alamo.createClient({ foo: 'bar' });
        client.should.be.an.instanceOf(require('../lib/client'));
      });
    });

    describe('prototype', function () {
      describe('#client', function () {
        it('allows access to the lower level s3 client', function () {
          var s3Client = { foo: 'bar' };
          sandbox.stub(knox, 'createClient').returns(s3Client);
          var client = alamo.createClient({});
          client.client.should.equal(s3Client);
        });
      });

      describe('#request', function () {
        it('retrieves a stream and parses the response body', function (done) {
          var stream = new Stream;
          var mock = sandbox.mock(client);
          mock.expects('stream').withExactArgs('GET', '/some_key', {}, void 0, void 0).returns(stream);
          client.request('GET', '/some_key', function (err, resp) {
            if (err) return done(err);
            resp.body.toString().should.equal('foobar');
            resp.should.equal(stream);
            done();
          });
          stream.emit('pipe');
          stream.emit('data', new Buffer('foo'));
          stream.emit('data', new Buffer('bar'));
          stream.emit('end');
        });

        it('passes the content and headers and callbacks on finish', function (done) {
          var stream = new Stream;
          var mock = sandbox.mock(client);
          mock.expects('stream').withExactArgs('PUT', '/some_key', {acl: 'public-read'}, 'foobar', {}).returns(stream);
          client.request('PUT', '/some_key', {acl: 'public-read'}, 'foobar', done);
          stream.emit('finish');
        });

        it('retrieves a stream and callbacks on finish', function (done) {
          var stream = new Stream;
          var mock = sandbox.mock(client);
          mock.expects('stream').withExactArgs('DEL', '/some_key', {}, void 0, void 0).returns(stream);
          client.request('DEL', '/some_key', done);
          stream.emit('finish');
        });

        it('retrieves a stream and listens on error', function (done) {
          var stream = new Stream;
          var mock = sandbox.mock(client);
          mock.expects('stream').withExactArgs('GET', '/some_key', {}, void 0, void 0).returns(stream);
          client.request('GET', '/some_key', function (err) {
            expect(err).to.be.an.instanceOf(Error);
            done();
          });
          stream.emit('error', new Error('Some error'));
        });

        it('passes headers', function (done) {
          var stream = new Stream;
          var mock = sandbox.mock(client);
          mock.expects('stream')
            .withExactArgs('GET', '/some_key', { 'accept-encoding': 'gzip' }, void 0, void 0)
            .returns(stream);
          client.request('GET', '/some_key', { 'accept-encoding': 'gzip' }, done.bind(null, null));
          stream.emit('error', new Error('Some error'));
        });
      });

      ['get', 'del', 'put', 'post'].forEach(function (method) {
        describe(format('#%s', method), function () {
          it('executes #request with the correct method', function (done) {
            var mock = sandbox.mock(client);
            mock.expects('request')
              .withArgs(sinon.match(method.toUpperCase(), '/some_key'))
              .yieldsAsync(null, { body: 'foobar' });
            client[method]('/some_key', function (err, resp) {
              if (err) return done(err);
              resp.body.should.equal('foobar');
              done();
            })
          });
        });
      });

      describe('#stream', function () {
        var stream, mock, res;

        beforeEach(function () {
          stream = new Stream.Writable;
          res = new Stream.Readable;
          var s3Client = knox.createClient({
            key: 'AWS_ACCESS_KEY_ID',
            secret: 'AWS_SECRET_ACCESS_KEY',
            bucket: 'AWS_BUCKET'
          });
          mock = sandbox.mock(s3Client);
          client.client = s3Client;
          res._read = noop;
        });

        it('retrieves a stream, parses the response and pipe to the returned stream', function (done) {
          mock.expects('request').withExactArgs('GET', '/some_key', {}).returns(stream);
          res.statusCode = 200;
          res.headers = { 'content-length': 6 };
          var req = client.stream('GET', '/some_key');
          req.on('pipe', function (source) {
            source.should.equal(res);
            done();
          });
          req.on('error', done);
          stream.end = function () {
            stream.emit('response', res);
          };
          req.end();
        });

        it('parses the response, emit an error and parse the XML response on invalid status code', function (done) {
          var xml = xmlFixture('error');
          mock.expects('request').withExactArgs('GET', '/some_key', {}).returns(stream);
          res.statusCode = 404;
          res.headers = { 'content-length': xml.length };
          var req = client.stream('GET', '/some_key');
          req.on('pipe', done.bind(null, new Error('Unexpected call to pipe')));
          req.on('error', function (err) {
            err.should.be.an.instanceOf(Error);
            err.status.should.equal(404);
            err.message.should.equal('No such key');
            err.code.should.equal('NoSuchKey');
            err.requestId.should.equal('rid');
            err.hostId.should.equal('hid');
            done();
          });
          stream.end = function () {
            stream.emit('response', res);
            res.emit('data', new Buffer(xml));
            res.emit('end');
          };
          req.end();
        });

        it('parses the response, emit an error and do not fail on invalid XML', function (done) {
          var xml = '';
          mock.expects('request').withExactArgs('GET', '/some_key', {}).returns(stream);
          res.statusCode = 404;
          res.headers = { 'content-length': 10 };
          var req = client.stream('GET', '/some_key');
          req.on('pipe', done.bind(null, new Error('Unexpected call to pipe')));
          req.on('error', function (err) {
            err.should.be.an.instanceOf(Error);
            err.status.should.equal(404);
            err.message.should.equal('Not Found');
            done();
          });
          stream.end = function () {
            stream.emit('response', res);
            res.emit('data', new Buffer(xml));
            res.emit('end');
          };
          req.end();
        });

        it('parses the response, emit an error on body parsing', function (done) {
          var xml = xmlFixture('error');
          mock.expects('request').withExactArgs('GET', '/some_key', {}).returns(stream);
          res.statusCode = 404;
          res.headers = { 'content-length': xml.length };
          var req = client.stream('GET', '/some_key');
          req.on('pipe', done.bind(null, new Error('Unexpected call to pipe')));
          req.on('error', function (err) {
            err.should.be.an.instanceOf(Error);
            err.status.should.equal(404);
            err.message.should.equal('Not Found');
            done();
          });
          stream.end = function () {
            stream.emit('response', res);
            res.emit('error', new Error('some error'));
          };
          req.end();
        });

        it('parses the response, emit an error and do not try to parse empty responses', function (done) {
          var xml = xmlFixture('error');
          mock.expects('request').withExactArgs('GET', '/some_key', {}).returns(stream);
          res.statusCode = 404;
          res.headers = { 'content-length': 0 };
          var req = client.stream('GET', '/some_key');
          req.on('pipe', done.bind(null, new Error('Unexpected call to pipe')));
          req.on('error', function (err) {
            err.should.be.an.instanceOf(Error);
            err.status.should.equal(404);
            err.message.should.equal('Not Found');
            done();
          });
          stream.end = function () {
            stream.emit('response', res);
            res.emit('data', new Buffer(xml));
            res.emit('end');
          };
          req.end();
        });

        it('allows specifying number of retries and retries on error', function (done) {
          var retries = 0;
          mock.expects('request').withExactArgs('GET', '/some_key', {}).twice().returns(stream);
          res.statusCode = 500;
          res.headers = { 'content-length': 0 };
          stream.end = function () {
            if (++retries === 1) {
              stream.emit('response', res);
              stream.removeAllListeners();
            } else {
              res.statusCode = 200;
              res.headers = {};
              stream.emit('response', res);
            }
          };
          var req = client.stream('GET', '/some_key', {}, '', { retries: 1, minTimeout: 1, maxTimeout: 10 });
          req.on('pipe', done.bind(null, null));
          req.on('error', done);
        });

        it('retries and emit an error in the end', function (done) {
          var retries = 0;
          mock.expects('request').withExactArgs('GET', '/some_key', {}).twice().returns(stream);
          res.statusCode = 500;
          res.headers = { 'content-length': 0 };
          stream.end = function () {
            if (++retries === 1) {
              stream.emit('response', res);
              stream.removeAllListeners();
            } else {
              stream.emit('response', res);
            }
          };
          var req = client.stream('GET', '/some_key', {}, '', { retries: 1, minTimeout: 1, maxTimeout: 10 });
          req.on('pipe', done.bind(null, new Error('Unexpected call to pipe')));
          req.on('error', function (err) {
            err.should.be.an.instanceOf(Error);
            err.status.should.equal(500);
            err.message.should.equal('Internal Server Error');
            done();
          });
        });

        it('writes the content, set md5, content-length headers, and emit finish event', function (done) {
          mock.expects('request')
            .withExactArgs('PUT', '/some_key', { 'content-length': 6, 'content-md5': 'OFj2IjCsPJFfMAxmQxLGPw==' })
            .returns(stream);
          res.statusCode = 204;
          res.headers = { 'content-length': 0 };
          stream.end = function (data) {
            data.should.equal('foobar');
            setImmediate(stream.emit.bind(stream, 'response', res));
          };
          var req = client.stream('PUT', '/some_key', {}, 'foobar');
          req.on('error', done);
          req.on('finish', function (resp) {
            resp.should.equal(res);
            done();
          });
        });
      });

      describe('#createReadStream', function () {
        it('executes #stream and returns a stream', function () {
          var stream = new Stream;
          var mock = sandbox.mock(client);
          mock.expects('stream').withExactArgs('GET', '/some_key', void 0, '', void 0).returns(stream);
          client.createReadStream('/some_key').should.equal(stream);
        });
      });

      describe('#createWriteStream', function () {
        it('executes #stream and returns a stream', function () {
          var stream = new Stream;
          var mock = sandbox.mock(client);
          mock.expects('stream').withExactArgs('PUT', '/some_key', void 0, void 0, void 0).returns(stream);
          client.createWriteStream('/some_key').should.equal(stream);
        });
      });

      describe('#signedUrl', function () {
        it('returns a signed url for the object', function () {
          var s3Client = knox.createClient({
            key: 'AWS_ACCESS_KEY_ID',
            secret: 'AWS_SECRET_ACCESS_KEY',
            bucket: 'AWS_BUCKET'
          });
          client.client = s3Client;
          var mock = sandbox.mock(s3Client);
          mock.expects('signedUrl').withExactArgs('/some_key', sinon.match.date, void 0).returns('https://some_url');
          client.signedUrl('/some_key', 10).should.equal('https://some_url');
        });
      });
    });
  });
})();
