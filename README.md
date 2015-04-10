# 4front-s3-storage

[S3](http://aws.amazon.com/s3) based storage for the [4front web platform](http://4front.io). Used to store uploaded virtual app assets such as JavaScripts, stylesheets, html files, images, and more.

## Installation
~~~
npm install 4front-s3-storage
~~~

## Usage

~~~js
var s3Deployments = require('4front-s3-deployments')({
	region: 'us-west-2',
	bucket: '4front-deployments'
});
~~~

You can pass in any valid option accepted by the [AWS.config](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html) object including `region`, `accessKeyId`, `secretAccessKey`, etc.

## Running Tests
~~~
npm test
~~~
