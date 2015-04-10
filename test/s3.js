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

	before(function(done) {
		self = this;

		var port = 4658;
		var bucket = "4front-deployments";

		this.s3 = new S3Deployments({
			bucket: bucket,
			accessKeyId: "123",
		  secretAccessKey: "abc",
		  endpoint: "localhost:" + port,
		  sslEnabled: false,
		  s3ForcePathStyle: true
		});

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
				self.s3._s3.createBucket({ACL: 'public-read', Bucket: bucket}, function(err) {
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
				self.s3.deployFile(self.appId, self.versionId, fileInfo, cb);
			},
			function(cb) {
				self.s3.fileExists(self.appId, self.versionId, fileInfo.path, function(err, exists) {
					if (err) return cb(err);

					assert.isTrue(exists);
					cb();
				});
			},
			function(cb) {
				var output = '';
				self.s3.readFileStream(self.appId, self.versionId, fileInfo.path)
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
		self.s3.fileExists(this.appId, this.versionId, 'missingfile.txt', function(err, exists) {
			if (err) return done(err);

			assert.isFalse(exists);
			done();
		});
	});

	it('delete version', function(done) {
		var files = ['js/main.js', 'css/styles.css'];

		async.series([
			function(cb) {
				// Upload some files
				async.each(files, function(path, cb1) {
					var fileInfo = {
						path: path,
						contents: sbuff(path),
						size: path.length
					};
					self.s3.deployFile(self.appId, self.versionId, fileInfo, cb1);
				}, cb);
			},
			function(cb) {
				// Delete the version
				self.s3.deleteVersion(self.appId, self.versionId, cb);
			},
			function(cb) {
				// Verify that the files are gone.
				async.each(files, function(filePath, cb1) {
					self.s3.fileExists(self.appId, self.versionId, filePath, function(err, exists) {
						if (err) return cb1(err);

						assert.isFalse(exists);
						cb1();
					});
				}, cb);
			}
		], done);
	});
});
