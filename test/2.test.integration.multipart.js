(function () {
  'use strict';

  describe('integration multipart', function () {
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

    it('uploads using s3 multipart api', function (done) {
      var file = fs.readFileSync('package.json').toString();
      var initXml = xmlFixture('multipart-initiate');
      var completeXml = xmlFixture('multipart-complete-one-part');
      nock('https://s3.amazonaws.com')
        .post('/AWS_BUCKET/some_key?uploads')
        .reply(200, initXml, { 'content-length': initXml.length })
        .put('/AWS_BUCKET/some_key?uploadId=foobar&partNumber=1', file)
        .reply(204, '', { etag: 'foobar', 'content-length': 0 })
        .post('/AWS_BUCKET/some_key?uploadId=foobar', completeXml, { 'content-length': completeXml.length })
        .reply(200, '', { 'content-length': 0 });
      var stream = client.multipart('/some_key');
      stream.on('error', done);
      stream.on('finish', function (res) {
        res.statusCode.should.equal(200);
        done();
      });
      fs.createReadStream('package.json').on('error', done).pipe(stream);
    });
  });
})();
