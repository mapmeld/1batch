/*global it, describe*/

var assert = require('chai').assert;
var request = require('supertest');

var app = require('../app.js');
var User = require('../models/user.js');

describe('user appears', function() {
  function createUser(username, callback) {
    var u = new User();
    u.name = username;
    u.save(function(err) {
      callback(err || null);
    });
  }

  function requestProfile(done, callback) {
    request(app)
      .get('/profile/test')
      .expect(200)
      .end(function(err, res) {
        if (err) {
          return done(err);
        }
        callback(res);
      });
  }

  function wrapup(done) {
    User.find({ test: true }).remove();
    done();
  }

  it('shows user name', function(done) {
    createUser('test', function(err) {
      if (err) {
        done(err);
      }
      requestProfile(done, function(res) {
        assert.include(res.text, 'test');
        wrapup(done);
      });
    });
  });

  it('profile has no photos', function(done) {
    createUser('test', function(err) {
      if (err) {
        done(err);
      }
      requestProfile(done, function(res) {
        assert.include(res.text, 'hasn\'t posted yet!');
        wrapup(done);
      });
    });
  });
});
