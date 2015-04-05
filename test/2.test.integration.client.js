(function () {
  'use strict';

  describe('integration client', function () {
    var client;
    var fs = require('fs');
    var alamo = require('../');

    beforeEach(function () {
      client = alamo.createClient({
        key: 'AWS_ACCESS_KEY_ID',
        secret: 'AWS_SECRET_ACCESS_KEY',
        bucket: 'AWS_BUCKET'
      });
    });

    describe('#request', function () {
      describe('#get', function () {
        it('returns the data', function (done) {
          nock('https://s3.amazonaws.com')
            .get('/AWS_BUCKET/some_key')
            .reply(200, 'foobar', { 'content-length': 6 });
          client.get('/some_key', function (err, resp) {
            if (err) return done(err);
            resp.body.toString().should.equal('foobar');
            done();
          });
        });

        it('returns a 404', function (done) {
          var xml = xmlFixture('error');
          nock('https://s3.amazonaws.com')
            .get('/AWS_BUCKET/some_key')
            .reply(404, xml, { 'content-length': xml.length });
          client.get('/some_key', function (err) {
            if (! err) return done(new Error('Expected error'));
            err.should.be.an.instanceOf(Error);
            err.message.should.equal('No such key');
            err.status.should.equal(404);
            done();
          });
        });
      });

      describe('#put', function () {
        it('puts the data', function (done) {
          nock('https://s3.amazonaws.com')
            .put('/AWS_BUCKET/some_key', 'foobar')
            .reply(204);
          client.put('/some_key', 'foobar', function (err) {
            if (err) return done(err);
            done();
          });
        });
      });
    });

    describe('#stream', function () {
      describe('#createReadStream', function () {
        it('returns a readable stream', function (done) {
          var file = fs.readFileSync('package.json').toString();
          nock('https://s3.amazonaws.com')
            .get('/AWS_BUCKET/some_key')
            .reply(200, fs.createReadStream('package.json'), { 'content-length': file.length });
          var body = '';
          var stream = client.createReadStream('/some_key');
          stream.on('error', done);
          stream.on('data', function (chunk) {
            body += chunk.toString();
          });
          stream.on('end', function () {
            body.should.equal(file);
            done();
          });
        });
      });

      describe('#createWriteStream', function () {
        it('returns a writable stream', function (done) {
          var file = fs.readFileSync('package.json').toString();
          nock('https://s3.amazonaws.com')
            .put('/AWS_BUCKET/some_key', file)
            .reply(204, '', { 'content-length': 0 });
          var stream = client.createWriteStream('/some_key');
          stream.on('error', done);
          stream.on('finish', function (res) {
            res.statusCode.should.equal(204);
            done();
          });
          fs.createReadStream('package.json').on('error', done).pipe(stream);
        });
      });
    });

  });
})();
