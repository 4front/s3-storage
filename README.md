# 4front-s3-deployments

<!-- [![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url] -->
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]

[S3](http://aws.amazon.com/s3) based code deployments or the [4front web platform](http://4front.io). Used to store uploaded virtual app assets such as JavaScripts, stylesheets, html files, images, and more.

Although static assets can be served via the 4front node.js platform, it is more efficient to use S3 as a web host directly. See the AWS docs on how to [configure a bucket for static hosting](http://docs.aws.amazon.com/AmazonS3/latest/UG/ConfiguringBucketWebsite.html). As a further optimization you can configure CloudFront (or another CDN) in front of the S3 bucket URL. The [htmlprep](https://www.npmjs.com/package/htmlprep) package dynamically rewrites your relative asset paths to the appropriate absolute path.

For a local installation of the 4front platform, the [s3rver](https://www.npmjs.com/package/s3rver) provides a mock implementation of S3 that utilizes your local filesystem.

## Installation
~~~
npm install 4front-s3-deployments
~~~

## Usage

~~~js
var s3Deployments = require('4front-s3-deployments')({
	region: 'us-west-2',
	bucket: '4front-deployments'
});
~~~

You can pass in any valid option accepted by the [AWS.config](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html) object including `region`, `accessKeyId`, `secretAccessKey`, etc.

### API

~~~js
// Deploy an individual file
var fileInfo = {
	path: '/js/app.js',
	contents: fs.createReadStream('/js/app.js'),
	size: fs.statSync('/js/app.js').size
};

s3Deployments.deployFile(appId, versionId, fileInfo, callback);

// Returns a readable stream
s3Deployments.readFileStream(appId, versionId, filePath);

// Delete version
s3Deployments.deleteVersion(appId, versionId, callback);

// Check if file exists
s3Deployments.fileExists(appId, versionId, filePath, callback);
~~~

## Running Tests
~~~
npm test
~~~

## License
Licensed under the Apache License, Version 2.0. See the top-level file LICENSE.txt and (http://www.apache.org/licenses/LICENSE-2.0).

[npm-image]: https://img.shields.io/npm/v/4front-s3-deployments.svg?style=flat
[npm-url]: https://npmjs.org/package/4front-s3-deployments
[travis-image]: https://img.shields.io/travis/4front/s3-deployments.svg?style=flat
[travis-url]: https://travis-ci.org/4front/s3-deployments
[coveralls-image]: https://img.shields.io/coveralls/4front-s3-deployments.svg?style=flat
[coveralls-url]: https://coveralls.io/r/4front/s3-deployments?branch=master
[downloads-image]: https://img.shields.io/npm/dm/4front-s3-deployments.svg?style=flat
[downloads-url]: https://npmjs.org/package/4front-s3-deployments
