/* @flow */

var mongoose = require('mongoose');

var userSchema = mongoose.Schema({
  name: String,
  id: String,
  images: [String],
  imageids: [String],
  posted: Date,
  test: Boolean
});

module.exports = mongoose.model('User', userSchema);
