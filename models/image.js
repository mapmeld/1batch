/* @flow */

var mongoose = require('mongoose');

var imageSchema = mongoose.Schema({
  user_id: String,
  src: String,
  comments: [String],
  hidden: Boolean,
  test: Boolean,
  caption: String,
  published: Boolean,
  picked: Boolean
});

module.exports = mongoose.model('Image', imageSchema);
