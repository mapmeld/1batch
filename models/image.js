/* @flow */

var mongoose = require('mongoose');

var imageSchema = mongoose.Schema({
  user_id: String,
  src: String,
  comments: [String],
  hidden: Boolean,
  test: Boolean,
  caption: String
});

module.exports = mongoose.model('Image', imageSchema);
