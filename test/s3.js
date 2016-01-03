var async = require('async');
var assert = require('assert');
var sbuff = require('simple-bufferstream');
var S3rver = require('s3rver');
var fs = require('fs');
var shortid = require('shortid');
var through = require('through2');
var S3Storage = require('../lib/s3');

require('dash-assert');

describe('S3Storage', function() {
  var self;

  var port = 9991;
  var bucket = '4front-deployments';

  before(function(done) {
    this.timeout(5000);
    self = this;
    var s3rver = new S3rver();

    var fakeS3Dir = '/tmp/s3rver';
    async.series([
      function(cb) {
        // Make sure the fakeS3Dir exists
        fs.mkdir(fakeS3Dir, function(err) {
          if (err && err.code !== 'EEXIST') return cb(err);

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
      }
    ], done);
  });

  beforeEach(function(done) {
    this.options = {
      bucket: bucket,
      accessKeyId: '123',
      secretAccessKey: 'abc',
      endpoint: 'localhost:' + port,
      sslEnabled: false,
      s3ForcePathStyle: true
    };

    this.s3Storage = new S3Storage(this.options);

    // Ensure the bucket exists
    this.s3Storage._s3.createBucket({ACL: 'public-read', Bucket: this.options.bucket}, function(err) {
      if (err && err.code !== 'BucketAlreadyExists') return done(err);

      done();
    });
  });

  it('writeFile', function(done) {
    var fileContents = 'text file contents';

    var fileInfo = {
      path: 'appid/versionid/files/plain.txt',
      contents: sbuff(fileContents),
      size: fileContents.length
    };

    async.series([
      function(cb) {
        self.s3Storage.writeFile(fileInfo, cb);
      },
      function(cb) {
        self.s3Storage.fileExists(fileInfo.path, function(err, exists) {
          if (err) return cb(err);

          assert.isTrue(exists);
          cb();
        });
      },
      function(cb) {
        var output = '';
        self.s3Storage.readFileStream(fileInfo.path)
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

  describe('readFile', function() {
    it('existing file', function(done) {
      var fileContents = 'text file contents';

      var fileInfo = {
        path: 'appid/versionid/files/' + shortid.generate() + '.txt',
        contents: sbuff(fileContents),
        size: fileContents.length
      };

      async.series([
        function(cb) {
          self.s3Storage.writeFile(fileInfo, cb);
        },
        function(cb) {
          self.s3Storage.readFile(fileInfo.path, function(err, data) {
            if (err) return cb(err);

            assert.equal(data, fileContents);
            cb();
          });
        }
      ], done);
    });

    it('missing file', function(done) {
      self.s3Storage.readFile('directory/missingfile.txt', function(err, data) {
        if (err) return done(err);

        assert.isNull(data);
        done();
      });
    });
  });

  // The S3 mock doesn't support the upload function
  // it('writeStream', function(done) {
  //   var fileContents = "text file contents";
  //
  //   var fileInfo = {
  //     path: "appid/versionid/files/plain.txt",
  //     contents: sbuff(fileContents)
  //   };
  //
  //   async.series([
  //     function(cb) {
  //       self.s3Storage.writeStream(fileInfo, cb);
  //     },
  //     function(cb) {
  //       self.s3Storage.readFile(fileInfo.path, function(err, data) {
  //         assert.equal(data, fileContents);
  //       });
  //     }
  //   ], done);
  // });

  it('fileExists returns false for missing file', function(done) {
    self.s3Storage.fileExists('dir/missingfile.txt', function(err, exists) {
      if (err) return done(err);

      assert.isFalse(exists);
      done();
    });
  });

  describe('readFileStream', function() {
    beforeEach(function(done) {
      self = this;
      this.fileContents = 'asasfasdfasdf';
      // this.filePath =
      this.fileInfo = {
        path: 'appid/versionid/files/' + shortid.generate() + '.txt',
        contents: sbuff(this.fileContents),
        size: this.fileContents.length,
        gzipEncoded: true,
        maxAge: 10000
      };

      this.s3Storage.writeFile(this.fileInfo, done);
    });

    it('metadata event emitted', function(done) {
      var output = '';
      this.s3Storage.readFileStream(this.fileInfo.path)
        .on('metadata', function(metadata) {
          assert.equal(metadata.contentType, 'text/plain; charset=utf-8');
          // assert.equal(metadata['cache-control'], 'max-age=' + self.fileInfo.maxAge);
        })
        .on('error', done)
        .pipe(through(function(chunk, enc, cb) {
          output += chunk.toString();
          cb();
        }, function() {
          assert.equal(output, self.fileContents);
          done();
        }));
    });

    it('read missing file', function(done) {
      self.s3Storage.readFileStream('directory/missingfile.txt')
        .on('missing', function(err) {
          assert.equal(err.code, 'fileNotFound');
          done();
        })
        .on('end', function() {
          assert.fail('error event should have fired');
        });
    });
  });

  it('listFiles()', function(done) {
    var prefix = 'dir1/dir2';

    var files = [prefix + '/js/main.js', prefix + '/css/styles.css', prefix + '/index.html'];
    async.series([
      function(cb) {
        deployTestFiles(self.s3Storage, files, cb);
      },
      function(cb) {
        self.s3Storage.listFiles(prefix, function(err, data) {
          if (err) return cb(err);

          assert.noDifferences(files, data);
          cb();
        });
      }
    ], done);
  });

  it('deleteFiles()', function(done) {
    var prefix = 'dir1';
    var files = [prefix + 'js/main.js', prefix + 'css/styles.css'];

    async.series([
      function(cb) {
        // Upload some files
        deployTestFiles(self.s3Storage, files, cb);
      },
      function(cb) {
        // Delete the version
        self.s3Storage.deleteFiles(prefix, cb);
      },
      function(cb) {
        // Verify that the files are gone.
        async.each(files, function(filePath, cb1) {
          self.s3Storage.fileExists(filePath, function(err, exists) {
            if (err) return cb1(err);

            assert.isFalse(exists);
            cb1();
          });
        }, cb);
      }
    ], done);
  });

  describe('getMetadata()', function() {
    it('existing file', function(done) {
      var contents = 'text file contents';
      var fileInfo = {
        path: 'appid/versionid/files/plain.txt',
        contents: sbuff(contents),
        size: contents.length
      };

      self.s3Storage.writeFile(fileInfo, function() {
        self.s3Storage.getMetadata(fileInfo.path, function(err, metadata) {
          assert.equal(metadata.contentType, 'text/plain; charset=utf-8');
          done();
        });
      });
    });

    it('non-existant file', function(done) {
      self.s3Storage.getMetadata('missingfile.txt', function(err, metadata) {
        assert.isNull(metadata);
        done();
      });
    });
  });

  describe('key prefix', function() {
    it('writes with prefix', function(done) {
      this.options.keyPrefix = 'prefix/';

      var contents = 'text file contents';
      var fileInfo = {
        path: 'pathname/plain.txt',
        contents: sbuff(contents),
        size: contents.length
      };

      self.s3Storage.writeFile(fileInfo, function() {
        self.s3Storage._listKeys('pathname', function(err, keys) {
          assert.equal(keys[0], 'prefix/pathname/plain.txt');
          done();
        });
      });
    });
  });

  function deployTestFiles(s3Storage, files, callback) {
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
