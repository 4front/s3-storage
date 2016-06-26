var AWS = require('aws-sdk');

var masterRegion = {
  s3: new AWS.S3({region: 'us-west-2'}),
  bucket: 'aerobaticapp-versions'
};
