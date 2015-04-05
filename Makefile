test:
	@jshint . --verbose
	@jscs .
	$(MAKE) cov

cov:
	@NODE_ENV=test istanbul cover _mocha -- -R list
	@istanbul report cobertura
	@node test/support/badge.js

patch:
	npm version patch

minor:
	npm version minor

major:
	npm version major

release:
	git push
	git push --tags
	npm publish

release-patch: test patch release

release-minor: test minor release

release-major: test major release

.PHONY: test cov
