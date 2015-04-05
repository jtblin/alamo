(function () {
  'use strict';

  describe('#multipart', function () {
    var client;
    var alamo = require('../');
    var knox = require('knox');
    var crypto = require('crypto');
    var Stream = require('stream');
    var MPU_PART_SIZE = 1024 * 1024 * 5;

    var invalidXml = { body: '' };
    var validInit = { body: xmlFixture('multipart-initiate') };
    var invalidInit = { body: xmlFixture('multipart-initiate-empty') };

    beforeEach(function () {
      client = alamo.createClient({
        key: 'AWS_ACCESS_KEY_ID',
        secret: 'AWS_SECRET_ACCESS_KEY',
        bucket: 'AWS_BUCKET'
      });
    });

    describe('#initiate', function () {
      it('initiates the upload', function (done) {
        var mock = sandbox.mock(client);
        mock.expects('post').withArgs('/some_key?uploads', '', {}).yieldsAsync(null, validInit);
        var stream = client.multipart('/some_key');
        stream.should.be.an.instanceOf(Stream);
        stream.on('error', done);
        stream.on('init', function (uploadId) {
          uploadId.should.be.equal('foobar');
          done();
        });
      });

      it('emits an error on initiate error', function (done) {
        var error = new Error('some error');
        var mock = sandbox.mock(client);
        mock.expects('post').withArgs('/some_key?uploads', '', {}).yieldsAsync(error);
        var stream = client.multipart('/some_key');
        stream.on('error', function (err) {
          err.should.equal(error);
          done();
        });
        stream.on('init', function () {
          done(new Error('Unexpected call to init'));
        });
      });

      it('emits an error on missing uploadId', function (done) {
        var mock = sandbox.mock(client);
        mock.expects('post').withArgs('/some_key?uploads', '', {}).yieldsAsync(null, invalidInit);
        var stream = client.multipart('/some_key');
        stream.on('error', function (err) {
          err.should.be.an.instanceOf(Error);
          err.message.should.equal('Invalid upload id');
          done();
        });
        stream.on('init', function () {
          done(new Error('Unexpected call to init'));
        });
      });

      it('emits an error on invalid XML', function (done) {
        var mock = sandbox.mock(client);
        mock.expects('post').withArgs('/some_key?uploads', '', {}).yieldsAsync(null, invalidXml);
        var stream = client.multipart('/some_key');
        stream.on('error', function (err) {
          err.should.be.an.instanceOf(Error);
          err.message.should.equal('Could not parse XML string');
          done();
        });
        stream.on('init', function () {
          done(new Error('Unexpected call to init'));
        });
      });
    });

    it('uploads multiple parts', function (done) {
      var mock = sandbox.mock(client);
      var xml = xmlFixture('multipart-complete');
      mock.expects('post').withArgs('/some_key?uploads', '', {}).yieldsAsync(null, validInit);
      mock.expects('put')
        .withArgs('/some_key?uploadId=foobar&partNumber=1')
        .yieldsAsync(null, { headers: { 'content-length': 0, etag: 'foobar' } });
      mock.expects('put')
        .withArgs('/some_key?uploadId=foobar&partNumber=2')
        .yieldsAsync(null, { headers: { 'content-length': 0, etag: 'barfoo' } });
      mock.expects('post').withArgs('/some_key?uploadId=foobar', xml).yieldsAsync(null);
      var stream = client.multipart('/some_key');
      stream.on('error', done);
      stream.on('finish', done);
      stream.write(crypto.randomBytes(MPU_PART_SIZE));
      stream.write(crypto.randomBytes(1));
      stream.end();
    });

    it('uploads only one part', function (done) {
      var mock = sandbox.mock(client);
      var xml = xmlFixture('multipart-complete-one-part');
      mock.expects('post').withArgs('/some_key?uploads', '', {}).yieldsAsync(null, validInit);
      mock.expects('put')
        .withArgs('/some_key?uploadId=foobar&partNumber=1')
        .yieldsAsync(null, { headers: { 'content-length': 0, etag: 'foobar' } });
      mock.expects('post').withArgs('/some_key?uploadId=foobar', xml).yieldsAsync(null);
      var stream = client.multipart('/some_key');
      stream.on('error', done);
      stream.on('finish', done);
      stream.write(new Buffer('foobar'));
      stream.end();
    });

    it('aborts the upload on error', function (done) {
      var mock = sandbox.mock(client);
      var error = new Error('some error');
      mock.expects('post').withArgs('/some_key?uploads', '', {}).yieldsAsync(null, validInit);
      mock.expects('put').withArgs('/some_key?uploadId=foobar&partNumber=1').yieldsAsync(error);
      mock.expects('post').withArgs('/some_key?uploadId=foobar').never();
      mock.expects('stream').withArgs('DELETE', '/some_key?uploadId=foobar').returns(new Stream);
      var stream = client.multipart('/some_key');
      stream.on('error', function (err) {
        err.should.equal(error);
        done();
      });
      stream.on('finish', function () {
        done(new Error('Unexpected call to finish'));
      });
      stream.write(new Buffer('foobar'));
      stream.end();
    });

    it('emits an error on upload complete error', function (done) {
      var mock = sandbox.mock(client);
      var error = new Error('some error');
      var xml = xmlFixture('multipart-complete-one-part');
      mock.expects('post').withArgs('/some_key?uploads', '', {}).yieldsAsync(null, validInit);
      mock.expects('put')
        .withArgs('/some_key?uploadId=foobar&partNumber=1')
        .yieldsAsync(null, { headers: { 'content-length': 0, etag: 'foobar' } });
      mock.expects('post').withArgs('/some_key?uploadId=foobar', xml).yieldsAsync(error);
      var stream = client.multipart('/some_key');
      stream.on('error', function (err) {
        err.should.equal(error);
        done();
      });
      stream.on('finish', function () {
        done(new Error('Unexpected call to finish'));
      });
      stream.write(new Buffer('foobar'));
      stream.end();
    });
  });
})();
