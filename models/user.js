/* @flow */

var mongoose = require('mongoose');

var userSchema = mongoose.Schema({
  name: { type: String, lowercase: true },
  localpass: String,
  googid: String,
  fbid: String,
  posted: Date,
  test: Boolean,
  republish: Boolean,
  salt: String
});

module.exports = mongoose.model('OBUser', userSchema);
