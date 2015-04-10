var _ = require('lodash');
var async = require('async');
var path = require('path');
var mime = require('mime');
var debug = require('debug')('4front-s3-deployments');
var AWS = require('aws-sdk');

module.exports = S3Deployments = function(options) {
  this.options = _.defaults(options || {}, {
    maxAge: 30 * 60 * 30
  });

  this._s3 = new AWS.S3(options);
};

// Deploy a file for a specific app version
S3Deployments.prototype.deployFile = function(appId, versionId, fileInfo, callback) {
  var storageKey = appId + '/' + versionId + '/' + fileInfo.path;

  var s3Options = {
    Bucket: this.options.bucket,
    Key: storageKey,
    Body: fileInfo.contents,
    ContentType: mime.lookup(path.extname(fileInfo.path)),
    // Because the versionId is part of the path, we can set aggressive cache headers
    CacheControl: "public, max-age=" + this.options.maxAge,
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

S3Deployments.prototype.readFileStream = function(appId, versionId, filePath) {
  var storageKey = appId + '/' + versionId + '/' + filePath;
  return this._s3.getObject({Bucket: this.options.bucket, Key: storageKey }).createReadStream();
};

// Delete a deployed version of an app
S3Deployments.prototype.deleteVersion = function(appId, versionId, callback) {
  var self = this;
  var prefix = appId + '/' + versionId;

  this._s3.listObjects({Bucket: this.options.bucket, Prefix: prefix}, function(err, data) {
    if (err)
      return callback(err);

    // Now delete each object
    var keys = _.map(data.Contents, "Key");

    async.each(keys, function(key, cb) {
      self._s3.deleteObject({Bucket: self.options.bucket, Key: key}, cb);
    }, callback);
  });
};

S3Deployments.prototype.fileExists = function(appId, versionId, filePath, callback) {
  var key = appId + '/' + versionId + '/' + filePath;

  debug("checking if object with key %s exists", key);
  this._s3.headObject({Bucket: this.options.bucket, Key: key}, function(err) {
    if (err) {
      if (err.code === 'NotFound')
        return callback(null, false);
      else
        return callback(err);
    }

    callback(null, true);
  });
};
