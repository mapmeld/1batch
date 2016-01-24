
const request = require('supertest');

const User = require('../models/user.js');
const Image = require('../models/image.js');
const app = require('../app.js');

module.exports = {

  createUser: function(username, callback) {
    var u = new User();
    u.test = true;
    u.name = username;
    u.posted = null;
    u.save(function(err) {
      callback(err || null, u);
    });
  },

  createImage: function(username, publish, callback) {
    var i = new Image();
    i.test = true;
    i.user_id = username;
    i.src = 'http://example.com';
    i.hidden = false;
    i.published = publish;
    i.picked = false;
    i.save(function(err) {
      callback(err || null, i);
    });
  },

  requestProfile: function(username, done, callback) {
    request(app)
      .get('/profile/' + username)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          return done(err);
        }
        callback(res);
      });
  },

  requestImage: function(username, imgid, done, callback) {
    request(app)
      .get('/' + username + '/photo/' + imgid)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          return done(err);
        }
        callback(res);
      });
  },

  wrapup: function(done) {
    User.remove({ test: true }, function() {
      Image.remove({ test: true }, function() {
        if (done) {
          done();
        }
      });
    });
  }
};
