# 4front-s3-storage

[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]

[S3](http://aws.amazon.com/s3) based storage for the [4front web platform](http://4front.io). Used to store deployed assets such as JavaScripts, stylesheets, html files, images, and more.

Although static assets can be served via the 4front node.js platform, it is more efficient to use S3 as a web host directly with [CloudFront](http://aws.amazon.com/cloudfront/) (or another CDN) sitting in front. See the AWS docs on how to [configure an S3  bucket for static hosting](http://docs.aws.amazon.com/AmazonS3/latest/UG/ConfiguringBucketWebsite.html). The [htmlprep](https://www.npmjs.com/package/htmlprep) package dynamically rewrites relative asset paths in HTML files to the appropriate absolute path.

For a local installation of the 4front platform, the [s3rver](https://www.npmjs.com/package/s3rver) provides a mock implementation of S3 that utilizes your local filesystem.

## Usage

~~~js
var s3Storage = require('4front-s3-storage')({
	region: 'us-west-2',
	bucket: '4front-deployments'
});
~~~

You can pass in any valid option accepted by the [AWS.config](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html) object including `region`, `accessKeyId`, `secretAccessKey`, etc.

### API

~~~js
// Deploy an individual file
s3Deployments.deployFile(appId, versionId, fileInfo, callback);

// Returns a readable stream
s3Deployments.readFileStream(appId, versionId, filePath);

// Delete files based on a prefix
s3Deployments.deleteFiles(prefix, callback);

// List all the files for a version
s3Deployments.listFiles(appId, versionId, callback);

// Check if file exists
s3Deployments.fileExists(filePath, callback);
~~~

See the [unit tests](https://github.com/4front/s3-deployments/blob/master/test/s3.js) for example calls of all these functions.

## Running Tests
~~~
npm test
~~~

## License
Licensed under the Apache License, Version 2.0. See (http://www.apache.org/licenses/LICENSE-2.0).

[travis-image]: https://img.shields.io/travis/4front/s3-deployments.svg?style=flat
[travis-url]: https://travis-ci.org/4front/s3-deployments
[coveralls-image]: https://img.shields.io/coveralls/4front/s3-deployments.svg?style=flat
[coveralls-url]: https://coveralls.io/r/4front/s3-deployments?branch=master
