/* @flow */

var mongoose = require('mongoose');

var imageSchema = mongoose.Schema({
  user_id: String,
  src: String,
  comments: [String],
  test: Boolean
});

module.exports = mongoose.model('Image', imageSchema);
