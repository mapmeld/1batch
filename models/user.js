/* @flow */

var mongoose = require('mongoose');

var userSchema = mongoose.Schema({
  name: String,
  id: String,
  images: [String],
  posted: Date
});

module.exports = mongoose.model('User', userSchema);
