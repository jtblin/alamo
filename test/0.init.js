(function () {
  'use strict';

  beforeEach(function () {
    global.sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    // we don't want to verify on failure. It will just cause confusion.
    if (this.currentTest.state !== 'failed') {
      // Report mock verification errors as normal errors
      // (if we don't do this, all tests will be aborted, because
      // the global afterEach has failed (unexpected!))
      try {
        sandbox.verify();
      } catch (e) {
        this.test.error(e);
      }
    }

    sandbox.restore();
  });
})();
