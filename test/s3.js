var _ = require('lodash');
var async = require('async');
var assert = require('assert');
var shortid = require('shortid');
var sbuff = require('simple-bufferstream');
var S3rver = require('s3rver');
var fs = require('fs');
var S3Storage = require('../lib/s3');

require('dash-assert');

describe('S3Storage', function() {
	var self;

	var port = 4658;
	var bucket = "4front-deployments";

	var s3Storage = new S3Storage({
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
				s3Storage._s3.createBucket({ACL: 'public-read', Bucket: bucket}, function(err) {
					if (err && err.code !== 'BucketAlreadyExists')
						return cb(err);

					cb();
				});
			}
		], done);
	});

	it('deployFile', function(done) {
		var fileContents = "text file contents";

		var fileInfo = {
			path: "appid/versionid/files/plain.txt",
			contents: sbuff(fileContents),
			size: fileContents.length
		};

		async.series([
			function(cb) {
				s3Storage.writeFile(fileInfo, cb);
			},
			function(cb) {
				s3Storage.fileExists(fileInfo.path, function(err, exists) {
					if (err) return cb(err);

					assert.isTrue(exists);
					cb();
				});
			},
			function(cb) {
				var output = '';
				s3Storage.readFileStream(fileInfo.path)
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
		s3Storage.fileExists('dir/missingfile.txt', function(err, exists) {
			if (err) return done(err);

			assert.isFalse(exists);
			done();
		});
	});

	it('read missing file', function(done) {
		s3Storage.readFileStream('directory/missingfile.txt')
			.on('missing', function(err) {
				assert.equal(err.code, 'fileNotFound');
				done();
			})
			.on('end', function() {
				assert.fail("error event should have fired");
			});
	});

	it('listFiles()', function(done) {
		var prefix = "dir1/dir2";
		var files = [prefix + "/js/main.js", prefix + "/css/styles.css", prefix + "/index.html"];
		async.series([
			function(cb) {
				deployTestFiles(files, cb);
			},
			function(cb) {
				s3Storage.listFiles(prefix, function(err, data) {
					if (err) return cb(err);

					assert.noDifferences(files, data);
					cb();
				})
			}
		], done);
	});

	it('deleteFiles()', function(done) {
		var prefix = "dir1"
		var files = [prefix + 'js/main.js', prefix + 'css/styles.css'];

		async.series([
			function(cb) {
				// Upload some files
				deployTestFiles(files, cb);
			},
			function(cb) {
				// Delete the version
				s3Storage.deleteFiles(prefix, cb);
			},
			function(cb) {
				// Verify that the files are gone.
				async.each(files, function(filePath, cb1) {
					s3Storage.fileExists(filePath, function(err, exists) {
						if (err) return cb1(err);

						assert.isFalse(exists);
						cb1();
					});
				}, cb);
			}
		], done);
	});

	function deployTestFiles(files, callback) {
		async.each(files, function(path, cb) {
			var fileInfo = {
				path: path,
				contents: sbuff(path),
				size: path.length
			};
			s3Storage.writeFile(fileInfo, cb);
		}, callback);
	}
});
