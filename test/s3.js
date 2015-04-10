var _ = require('lodash');
var async = require('async');
var assert = require('assert');
var shortid = require('shortid');
var sbuff = require('simple-bufferstream');
var S3rver = require('s3rver');
var fs = require('fs');
var S3Deployments = require('../lib/s3');

require('dash-assert');

describe('S3Deployments', function() {
	var self;

	var port = 4658;
	var bucket = "4front-deployments";

	var s3Deployments = new S3Deployments({
		bucket: bucket,
		accessKeyId: "123",
		secretAccessKey: "abc",
		endpoint: "localhost:" + port,
		sslEnabled: false,
		s3ForcePathStyle: true
	});

	before(function(done) {
		self = this;
		var s3rver = new S3rver();

		var fakeS3Dir = '/tmp/s3rver';
		async.series([
			function(cb) {
				// Make sure the fakeS3Dir exists
				fs.mkdir(fakeS3Dir, function(err) {
					if (err && err.code !== 'EEXIST')
						return cb(err);

					cb();
				});
			},
			function(cb) {
				// Start the fake S3 server
				s3rver.setHostname('localhost')
		      .setPort(port)
		      .setDirectory(fakeS3Dir)
		      .setSilent(true)
		      .run(cb);
			},
			function(cb) {
				// Ensure the bucket exists
				s3Deployments._s3.createBucket({ACL: 'public-read', Bucket: bucket}, function(err) {
					if (err && err.code !== 'BucketAlreadyExists')
						return cb(err);

					cb();
				});
			}
		], done);
	});

	beforeEach(function() {
		this.appId = shortid.generate();
		this.versionId = shortid.generate();
	});

	it('deployFile', function(done) {
		var fileContents = "text file contents";

		var fileInfo = {
			path: "files/plain.txt",
			contents: sbuff(fileContents),
			size: fileContents.length
		};

		async.series([
			function(cb) {
				s3Deployments.deployFile(self.appId, self.versionId, fileInfo, cb);
			},
			function(cb) {
				s3Deployments.fileExists(self.appId, self.versionId, fileInfo.path, function(err, exists) {
					if (err) return cb(err);

					assert.isTrue(exists);
					cb();
				});
			},
			function(cb) {
				var output = '';
				s3Deployments.readFileStream(self.appId, self.versionId, fileInfo.path)
					.on('data', function(chunk) {
						output += chunk.toString();
					})
					.on('error', function(err) {
						return cb(err);
					})
					.on('end', function() {
						assert.equal(output, fileContents);
						cb();
					});
			}
		], done);
	});

	it('fileExists returns false for missing file', function(done) {
		s3Deployments.fileExists(this.appId, this.versionId, 'missingfile.txt', function(err, exists) {
			if (err) return done(err);

			assert.isFalse(exists);
			done();
		});
	});

	it('read missing file', function(done) {
		s3Deployments.readFileStream(this.appId, this.versionId, 'missingfile.txt')
			.on('missing', function(err) {
				assert.equal(err.code, 'fileNotFound');
				done();
			})
			.on('end', function() {
				assert.fail("error event should have fired");
			});
	});

	it('listFiles()', function(done) {
		var files = ["js/main.js", "css/styles.css", "index.html"];
		async.series([
			function(cb) {
				deployTestFiles(self.appId, self.versionId, files, cb);
			},
			function(cb) {
				s3Deployments.listFiles(self.appId, self.versionId, function(err, data) {
					if (err) return cb(err);

					assert.noDifferences(files, data);
					cb();
				})
			}
		], done);
	});

	it('deleteVersion()', function(done) {
		var files = ['js/main.js', 'css/styles.css'];

		async.series([
			function(cb) {
				// Upload some files
				deployTestFiles(self.appId, self.versionId, files, cb);
			},
			function(cb) {
				// Delete the version
				s3Deployments.deleteVersion(self.appId, self.versionId, cb);
			},
			function(cb) {
				// Verify that the files are gone.
				async.each(files, function(filePath, cb1) {
					s3Deployments.fileExists(self.appId, self.versionId, filePath, function(err, exists) {
						if (err) return cb1(err);

						assert.isFalse(exists);
						cb1();
					});
				}, cb);
			}
		], done);
	});

	it('deleteAllVersions()', function(done) {
		var versions = _.times(3, function() {
			return shortid.generate();
		});

		var files = ['js/main.js', 'css/styles.css'];

		async.series([
			function(cb) {
				async.each(versions, function(versionId, cb1) {
					deployTestFiles(self.appId, versionId, files, cb1);
				}, cb);
			},
			function(cb) {
				// Delete the application
				s3Deployments.deleteAllVersions(self.appId, cb);
			},
			function(cb) {
				// Verify that the versions are gone
				s3Deployments._listKeys(self.appId, function(err, keys) {
					assert.equal(0, keys.length);
					cb();
				});
			}
		], done);
	});

	function deployTestFiles(appId, versionId, files, callback) {
		async.each(files, function(path, cb) {
			var fileInfo = {
				path: path,
				contents: sbuff(path),
				size: path.length
			};
			s3Deployments.deployFile(appId, versionId, fileInfo, cb);
		}, callback);
	}
});
