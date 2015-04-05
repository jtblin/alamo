var chai = require('chai');
global.chai = chai;
global.should = chai.should();
global.expect = chai.expect;
var sinonChai = require('sinon-chai');
chai.use(sinonChai);
global.sinon = require('sinon');
global.nock = require('nock');
nock.disableNetConnect();
global.noop = function () {};
var fs = require('fs');
var format = require('util').format;
global.xmlFixture = function (name) {
  return fs.readFileSync(format('test/fixtures/%s.xml', name)).toString().replace(/[\n\t]/g, '').trim();
};
