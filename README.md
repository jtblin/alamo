[![NPM version](https://badge.fury.io/js/alamo.svg)](http://badge.fury.io/js/alamo)
[![Build Status](https://travis-ci.org/jtblin/alamo.png)](https://travis-ci.org/jtblin/alamo)
[![Code Climate](https://codeclimate.com/github/jtblin/alamo/badges/gpa.svg)](https://codeclimate.com/github/jtblin/alamo)
[![Dependency Status](https://david-dm.org/jtblin/alamo.svg)](https://david-dm.org/jtblin/alamo)
![Code Coverage](https://rawgit.com/jtblin/alamo/master/test/coverage.svg)
[![experimental](http://badges.github.io/stability-badges/dist/experimental.svg)](http://github.com/badges/stability-badges)

# Overview

`alamo` is a wrapper around [knox](https://github.com/LearnBoost/knox) that provides an higher level abstraction
for s3 with handling of response status codes and automatic parsing of XML error bodies. It also provide a consistent
full (writing and reading) streaming interface, including multipart upload for large artifacts. Alamo implements
automatic retries on error with exponential back-off.

## Why alamo?

1. **knox** is quite low-level with regards to response and error handling which lead to code duplication to parse
response status codes and errors for each request as pointed out by @domenic himself in https://github.com/Automattic/knox/issues/114
1. the aws-sdk allow uploading streams (in an awkward way) but does not allow retrieving streams
1. the aws-sdk allow multipart upload but is low-level and let a lot to implement by the caller
1. [knox-mpu](https://github.com/nathanoehlman/knox-mpu) allows multipart upload but buffers everything in memory
which is only viable when uploading from your desktop without concurrency, but not viable from a server
1. neither **knox** or **knox-mpu** implements retries which is problematic when uploading large artifacts to s3
1. [Fort Knox](http://en.wikipedia.org/wiki/Fort_Knox) - [Fort Alamo](http://en.wikipedia.org/wiki/Battle_of_the_Alamo)

## Usage

    npm install --save alamo

## API

### alamo.createClient(options)

  Returns an s3 client. It accepts the same options as
  [knox.createClient](https://github.com/Automattic/knox#client-creation-options) plus the following ones
  that set how retries work (see [retry](https://www.npmjs.com/package/retry)):

  * `retries`: max number of retries (default **10**)
  * `factor`: factor for retry (default **2**)
  * `minTimeout`: minimum time for first retry (default **1000**)
  * `maxTimeout`: maximum time for all retries (default **60000**)

```js
var client = require('alamo').createClient({
	key: process.env.AWS_ACCESS_KEY_ID,
	secret: process.env.AWS_SECRET_ACCESS_KEY,
	bucket: process.env.AWS_BUCKET,
	region: process.env.AWS_REGION
});
```

### Client.prototype.client

  Access to the lower level **knox** client

### Client.prototype.createReadStream(filename, headers)

  Returns a readable stream.

```js
var fs = require('fs');

client.createReadStream('/somekey').pipe(fs.createWriteStream('somefile'));
```

* `filename`: the s3 file name to retrieve
* `headers`: optional headers
* `options`: retry options

Alias: `readStream`

### Client.prototype.createWriteStream(filename, headers, content)

  Returns a writable upload stream. You can optionally pass a buffer to upload instead of piping to it.

```js
var fs = require('fs');
var ws = client.createWriteStream('/somekey');

fs.createReadStream('somefile')
	.pipe(ws)
	.on('error', console.error)
	.on('finish', console.log.bind(console, 'Upload complete'));
```

* `filename`: the s3 file name to upload to
* `headers`: optional headers
* `content`: optional content to upload. If content is passed, it is passed to the underlying `request.end`
* `options`: retry options

Alias: `writeStream`

### Client.prototype.stream(method, filename, headers, content)

  Generic stream implementation that accepts the method as 1st argument as 2nd argument

```js
var fs = require('fs');
var ws = client.stream('PUT', '/somekey');

fs.createReadStream('somefile')
	.pipe(ws)
	.on('error', console.error)
	.on('finish', console.log.bind(console, 'Upload complete'));
```

* `method`: the http method e.g. `GET`, `PUT`
* `filename`: the s3 file name to upload to
* `headers`: optional headers
* `content`: optional content to upload. If content is passed, it is passed to the underlying `request.end`
* `options`: retry options

### Client.prototype.get(filename, headers, cb)

  Get an object and retrieve the response with the body

```js
client.get('/somekey', function (err, res) {
  if (err) console.error(err);
  else console.log(res.statusCode, res.body.toString());
});
```

* `filename`: the s3 file name to retrieve
* `headers`: optional headers
* `options`: retry options
* `cb`: callback that returns an error or `null` as 1st argument, and the response
with the body if no error as 2nd argument

### Client.prototype.del(filename, headers, cb)

  Delete an object from s3

```js
client.del('/somekey', function (err, res) {
  if (err) console.error(err);
  else console.log('object deleted %d', res.statusCode);
});
```

* `filename`: the s3 file name to delete
* `headers`: optional headers
* `options`: retry options
* `cb`: callback that returns an error or `null` as 1st argument, and the response if no error as 2nd argument

### Client.prototype.put(filename, content, headers, cb)

  Put an object

```js
client.put('/somekey', 'somedata', function (err, res) {
  if (err) console.error(err);
  else console.log('object uploaded %d', res.statusCode);
});
```

* `filename`: the s3 file name to upload to
* `content`: content to upload
* `headers`: optional headers
* `options`: retry options
* `cb`: callback that returns an error or `null` as 1st argument, and the response
if no error as 2nd argument

### Client.prototype.post(filename, content, headers, cb)

  Post an object

```js
client.post('/somekey', 'somedata', function (err, res) {
  if (err) console.error(err);
  else console.log('object uploaded %d with etag %s', res.statusCode, res.headers.etag);
});
```

* `filename`: the s3 file name to post to
* `content`: content to post
* `headers`: optional headers
* `options`: retry options
* `cb`: callback that returns an error or `null` as 1st argument, and the response
if no error

### Client.prototype.request(method, filename, content, headers, cb)

  Generic non streaming interface

```js
client.request('PUT', '/somekey', 'somedata', function (err, res) {
  if (err) console.error(err);
  else console.log('object uploaded %d with etag %s', res.statusCode, res.headers.etag);
});
```

* `method`: the http method e.g. `GET`, `PUT`, `DELETE`, `POST`
* `filename`: the s3 file name
* `content`: content to post
* `headers`: optional headers
* `cb`: callback that returns an error or `null` as 1st argument, and the response with the body if no error

### Client.prototype.signedUrl(filename, expiration, options)

  Returns a signed url

```js
var url = client.signedUrl('/somekey', 1000 * 60 * 15);
console.log(url);
```

* `filename`: the s3 file name to retrieve
* `expiration`: number of milliseconds that the signed url is valid for
* `options`: signed url options passed to **knox**, take `verb`, `contentType`, and `qs` object

### Client.prototype.multipart(filename, headers)

  Returns a writable stream to upload using the s3 multipart API. The stream is uploaded by chunks of 5mb in parallel
  with max concurrent uploads and automatic retries

```js
var fs = require('fs');
var ws = client.multipart('/somekey');

fs.createReadStream('somefile')
	.pipe(ws)
	.on('error', console.error)
	.on('finish', console.log.bind(console, 'Upload complete'));
```

* `filename`: the s3 file name to upload to
* `headers`: optional headers
* `options`: retry options

## Comparison with knox

### Retrieve a stream with **knox** with full error handling

```js
var fs = require('fs');
var XML = require('simple-xml');
var req = client.get('/filename');
req.on('response', function (res) {
  if (res.statusCode !== 200) {
  	var body = '';
  	res.on('data', function (chunk) {
  		body += chunk.toString();
  	});
	res.on('end', function () {
		try {
			body = XML.parse(body);
			cb(new Error(body.message);
		} catch (err) {
			cb(new Error(body);
		}
		cb(null, res);
	});
  	res.on('error', cb);
  	return;
  }
  res.pipe(fs.createWriteStream('filename').on('error', cb).on('finish', cb.bind(null, null));
});
req.on('error', cb);
```

## Roadmap

* Handle redirects and other 30x status codes: http://docs.aws.amazon.com/AmazonS3/latest/API/ErrorResponses.html
* Implement global max concurrent uploads
* Implement basic progress for multipart upload
* Accept string value for expiration that can be parsed by [ms](https://github.com/rauchg/ms.js)
* Add higher level functions for "file" upload / download
* Maybe use multipart upload automatically if content-length is unknown?
* Maybe allow automatic handling (parsing, marshalling) of json?

## Contributions

Please open issues for bugs and suggestions in [github](https://github.com/jtblin/alamo/issues).
Pull requests with tests are welcome.

## Author

Jerome Touffe-Blin, [@jtblin](https://twitter.com/jtlbin), [About me](http://about.me/jtblin)

## License

alamo is copyright 2015 Jerome Touffe-Blin and contributors. It is licensed under the BSD license.
See the include LICENSE file for details.
