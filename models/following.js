/* @flow */

var mongoose = require('mongoose');

var followSchema = mongoose.Schema({
  start_user_id: String, // Person A
  end_user_id: String,  // follows Person B (and all their photos, by default)
  unfollowed: [String], // array of Person B's photos that I don't care about
  blocked: Boolean,
  test: Boolean
});

module.exports = mongoose.model('Follow', followSchema);
