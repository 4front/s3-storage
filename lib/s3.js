var _ = require('lodash');
var async = require('async');
var path = require('path');
var mime = require('mime');
<<<<<<< HEAD
var debug = require('debug')('4front:s3-storage');
=======
var urljoin = require('url-join');
var debug = require('debug')('4front-s3-storage');
>>>>>>> 906dc4a623e05d90b9a2bfd6d357b2cdd356b94a
var AWS = require('aws-sdk');

require('simple-errors');

module.exports = S3Storage = function(options) {
  this.options = _.defaults(options || {}, {
    maxAge: 30 * 60 * 30,
    keyPrefix: null
  });

  this._s3 = new AWS.S3(options);
};

// TODO: Can we merge this with writeFile?
S3Storage.prototype.writeStream = function(fileInfo, callback) {
  var s3Options = {
    Bucket: this.options.bucket,
    Key: fileInfo.path,
    Body: fileInfo.contents,
    ContentType: mime.lookup(path.extname(fileInfo.path)),
    // Because the versionId is part of the path, we can set aggressive cache headers
    CacheControl: "public, max-age=" + fileInfo.maxAge,
    ACL: "public-read"
  };

  if (fileInfo.gzipEncoded === true)
    s3Options.ContentEncoding = "gzip";

  debug("putObject %s, ContentEncoding %s", s3Options.Key, s3Options.ContentEncoding);
  this._s3.upload(s3Options, function(err, data) {
    if (err) {
      debug("error putting object %s", s3Options.Key);
      return callback(err);
    }

    callback(null);
  });
};

// Deploy a file for a specific app version
S3Storage.prototype.writeFile = function(fileInfo, callback) {
  var s3Options = {
    Bucket: this.options.bucket,
    Key: this._buildKey(fileInfo.path),
    Body: fileInfo.contents,
    ContentType: mime.lookup(path.extname(fileInfo.path)),
    // Because the versionId is part of the path, we can set aggressive cache headers
    CacheControl: "public, max-age=" + fileInfo.maxAge,
    ACL: "public-read",
    ContentLength: fileInfo.size
  };

  if (fileInfo.gzipEncoded === true)
    s3Options.ContentEncoding = "gzip";

  debug("putObject %s, ContentEncoding %s", s3Options.Key, s3Options.ContentEncoding);
  this._s3.putObject(s3Options, function(err, data) {
    if (err) {
      debug("error putting object %s", s3Options.Key);
      return callback(err);
    }

    callback(null);
  });
};

S3Storage.prototype.readFileStream = function(filePath) {
  var s3Object = this._s3.getObject({
    Bucket: this.options.bucket,
<<<<<<< HEAD
    Key: filePath
=======
    Key: this._buildKey(filePath)
>>>>>>> 906dc4a623e05d90b9a2bfd6d357b2cdd356b94a
  });

  return s3Object.createReadStream()
    .on('readable', function() {
      // For some reason need to listen for "readable" event in order for the
      // "error" event to be emitted.
    })
    .on('error', function(err) {
      if (err.code === 'NoSuchKey')
        this.emit('missing', Error.create("File at path " + filePath + " not found.", {
          code: "fileNotFound"
        }));
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
<<<<<<< HEAD
  this._s3.headObject({
    Bucket: this.options.bucket,
    Key: filePath
  }, function(err) {
=======
  this._s3.headObject({Bucket: this.options.bucket, Key: this._buildKey(filePath)}, function(err) {
>>>>>>> 906dc4a623e05d90b9a2bfd6d357b2cdd356b94a
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

// Get the metadata for
S3Storage.prototype.getMetadata = function(filePath, callback) {
  this._s3.headObject({
    Bucket: this.options.bucket,
    Key: filePath
  }, function(err, data) {
    if (err) {
      if (err.code === 'NotFound')
        return callback(null, null);
      else
        return callback(err);
    }

    callback(null, data);
  });
};

S3Storage.prototype._listKeys = function(prefix, callback) {
  var self = this;
  this._s3.listObjects({Bucket: this.options.bucket, Prefix: this._buildKey(prefix)}, function(err, data) {
    if (err)
      return callback(err);

    callback(null, _.map(data.Contents, "Key"));
  });
};

S3Storage.prototype._deleteObjects = function(prefix, callback) {
  var self = this;
  this._listKeys(this._buildKey(prefix), function(err, keys) {
    if (err) return callback(err);

    async.each(keys, function(key, cb) {
      self._s3.deleteObject({
        Bucket: self.options.bucket,
        Key: key
      }, cb);
    }, callback);
  });
};

S3Storage.prototype._buildKey = function(key) {
  if (this.options.keyPrefix)
    return urljoin(this.options.keyPrefix, key);
  else
    return key;
};
