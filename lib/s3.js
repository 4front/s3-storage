var _ = require('lodash');
var async = require('async');
var path = require('path');
var mime = require('mime');
var camelcase = require('camelcase');
var debug = require('debug')('4front:s3-storage');
var urljoin = require('url-join');
var util = require('util');
var EventEmitter = require('events');
var AWS = require('aws-sdk');

require('simple-errors');

var S3Storage = function(options) {
  this.options = _.defaults(options || {}, {
    maxAge: 30 * 60 * 30,
    keyPrefix: null,
    maxKeys: 1000
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
    CacheControl: 'public, max-age=' + fileInfo.maxAge,
    ACL: 'public-read'
  };

  if (fileInfo.gzipEncoded === true) {
    s3Options.ContentEncoding = 'gzip';
  }

  debug('upload %s, gzipped %s', s3Options.Key, fileInfo.gzipEncoded === true);
  this._s3.upload(s3Options, function(err) {
    if (err) {
      debug('error putting object %s', s3Options.Key);
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
    CacheControl: 'public, max-age=' + fileInfo.maxAge,
    ACL: 'public-read',
    ContentLength: fileInfo.size
  };

  if (fileInfo.gzipEncoded === true) {
    s3Options.ContentEncoding = 'gzip';
  }

  debug('putObject %s, gzipEncoded %s', s3Options.Key, fileInfo.gzipEncoded === true);
  this._s3.putObject(s3Options, function(err) {
    if (err) {
      debug('error putting object %s', s3Options.Key);
      return callback(err);
    }

    callback(null);
  });
};

S3Storage.prototype.readFileStream = function(filePath) {
  var key = this._buildKey(filePath);
  var s3Request = this._s3.getObject({
    Bucket: this.options.bucket,
    Key: key
  });

  debug('read stream %s', key);

  // Create a new event emitter.
  var emitter = new StorageEventEmitter();
  var errorEmitted = false;

  s3Request.on('httpHeaders', function(status, headers) {
    debug('received http headers');

    // Stash the headers in a variable and emit the 'metadata' event
    // in the readable event once "this" refers to the readable stream
    // that is returned by this function.
    var metadata = _.mapKeys(headers, function(value, headerName) {
      return camelcase(headerName);
    });

    // Be sure to emit the metadata before emitting readStream. That gives the
    // client the opportunity to change the stream pipeline based on the metadata.
    emitter.emit('metadata', metadata);

    debug('createReadStream');
    var readStream = s3Request.createReadStream();
    readStream
      .on('error', function(err) {
        if (errorEmitted) return;
        errorEmitted = true;
        if (err.code === 'NoSuchKey') {
          emitter.emit('missing', Error.create('File at path ' + filePath + ' not found.', {
            code: 'fileNotFound'
          }));
        } else {
          emitter.emit('error', err);
        }
      });

    emitter.emit('stream', readStream);
  });

  s3Request.on('httpDone', function() {
    debug('stream done');
    emitter.emit('end');
  });

  s3Request.send();

  return emitter;
};

S3Storage.prototype.readFile = function(filePath, callback) {
  var params = {
    Bucket: this.options.bucket,
    Key: this._buildKey(filePath)
  };

  this._s3.getObject(params, function(err, data) {
    if (err) {
      if (err.code === 'NoSuchKey') return callback(null, null);
      return callback(err);
    }

    callback(null, data.Body.toString());
  });
};

// Delete a deployed version of an app
S3Storage.prototype.deleteFiles = function(prefix, callback) {
  this._deleteObjects(prefix, callback);
};

S3Storage.prototype.fileExists = function(filePath, callback) {
  // var key = appId + '/' + versionId + '/' + filePath;

  debug('checking if object with path %s exists', filePath);
  this._s3.headObject({Bucket: this.options.bucket, Key: this._buildKey(filePath)}, function(err) {
    if (err) {
      if (err.code === 'NotFound') return callback(null, false);
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
      if (err.code === 'NotFound') return callback(null, null);
      return callback(err);
    }

    callback(null, data);
  });
};

S3Storage.prototype._listKeys = function(prefix, callback) {
  var self = this;
  var keys = [];
  var nextMarker = null;
  var haveAllKeys = false;

  // AWS will return up to 1000 keys with each request. In order to ensure we
  // get all the keys, need to invoke listObjects repeatedly passing along
  // the NextMarker. Once IsTruncated is false, we have everything.
  async.until(function() {
    return haveAllKeys;
  }, function(cb) {
    self._s3.listObjects({
      Bucket: self.options.bucket,
      Prefix: self._buildKey(prefix),
      MaxKeys: self.options.maxKeys,
      Marker: nextMarker
    }, function(err, data) {
      if (err) return cb(err);

      var values = _.map(data.Contents, 'Key');
      if (data.IsTruncated === true) {
        nextMarker = values[values.length - 1];
      } else {
        haveAllKeys = true;
      }

      keys = keys.concat(values);

      cb(null);
    });
  }, function(err) {
    if (err) return callback(err);

    callback(null, keys);
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
  if (this.options.keyPrefix) {
    return urljoin(this.options.keyPrefix, key);
  }
  return key;
};

module.exports = S3Storage;

function StorageEventEmitter() {
  // Initialize necessary properties from `EventEmitter` in this instance
  EventEmitter.call(this);
}

// Inherit functions from `EventEmitter`'s prototype
util.inherits(StorageEventEmitter, EventEmitter);
