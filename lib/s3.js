var _ = require('lodash');
var async = require('async');
var path = require('path');
var mime = require('mime');
var debug = require('debug')('4front-s3-storage');
var AWS = require('aws-sdk');

require('simple-errors');

module.exports = S3Storage = function(options) {
  this.options = _.defaults(options || {}, {
    maxAge: 30 * 60 * 30
  });

  this._s3 = new AWS.S3(options);
};

// Deploy a file for a specific app version
S3Storage.prototype.writeFile = function(fileInfo, callback) {
  var s3Options = {
    Bucket: this.options.bucket,
    Key: fileInfo.path,
    Body: fileInfo.contents,
    ContentType: mime.lookup(path.extname(fileInfo.path)),
    // Because the versionId is part of the path, we can set aggressive cache headers
    CacheControl: "public, max-age=" + fileInfo.maxAge,
    ACL: "public-read",
    ContentLength: fileInfo.size
  };

  if (fileInfo.gzipEncoded === true)
    s3Options.ContentEncoding = "gzip";

  this._s3.putObject(s3Options, function(err, data) {
    if (err)
      return callback(err);

    callback(null);
  });
};

S3Storage.prototype.readFileStream = function(filePath) {
  var s3Object = this._s3.getObject({Bucket: this.options.bucket, Key: filePath });

  return s3Object.createReadStream()
    .on('readable', function() {
      // For some reason need to listen for "readable" event in order for the
      // "error" event to be emitted.
    })
    .on('error', function(err) {
      if (err.code === 'NoSuchKey')
        this.emit('missing', Error.create("File at path " + filePath + " not found.", {code: "fileNotFound"}));
      else
        this.emit('end');
    });
};

// Delete a deployed version of an app
S3Storage.prototype.deleteFiles = function(prefix, callback) {
  this._deleteObjects(prefix, callback);
};

S3Storage.prototype.fileExists = function(filePath, callback) {
  // var key = appId + '/' + versionId + '/' + filePath;

  debug("checking if object with path %s exists", filePath);
  this._s3.headObject({Bucket: this.options.bucket, Key: filePath}, function(err) {
    if (err) {
      if (err.code === 'NotFound')
        return callback(null, false);
      else
        return callback(err);
    }

    callback(null, true);
  });
};

// List the files deployed for a given version
S3Storage.prototype.listFiles = function(prefix, callback) {
  this._listKeys(prefix, callback);
};

S3Storage.prototype._listKeys = function(prefix, callback) {
  var self = this;
  this._s3.listObjects({Bucket: this.options.bucket, Prefix: prefix}, function(err, data) {
    if (err)
      return callback(err);

    callback(null, _.map(data.Contents, "Key"));
  });
};

S3Storage.prototype._deleteObjects = function(prefix, callback) {
  var self = this;
  this._listKeys(prefix, function(err, keys) {
    if (err) return callback(err);

    async.each(keys, function(key, cb) {
      self._s3.deleteObject({Bucket: self.options.bucket, Key: key}, cb);
    }, callback);
  });
};
