/*global it, describe*/

var assert = require('chai').assert;
var request = require('supertest');

var app = require('../app.js');
var User = require('../models/user.js');
var Image = require('../models/image.js');

function createUser(username, callback) {
  var u = new User();
  u.test = true;
  u.name = username;
  u.save(function(err) {
    callback(err || null, u);
  });
}

function createImage(user, publish, callback) {
  var i = new Image();
  i.test = true;
  i.user_id = user._id;
  i.src = 'http://example.com';
  i.hidden = !publish;
  i.save(function(err) {
    callback(err || null, i);
  });
}

function requestProfile(username, done, callback) {
  request(app)
    .get('/profile/' + username)
    .expect(200)
    .end(function(err, res) {
      if (err) {
        return done(err);
      }
      callback(res);
    });
}

function requestImage(username, imgid, done, callback) {
  request(app)
    .get('/' + username + '/photo/' + imgid)
    .expect(200)
    .end(function(err, res) {
      if (err) {
        return done(err);
      }
      callback(res);
    });
}

function wrapup(done) {
  User.remove({ test: true }, function() {
    Image.remove({ test: true }, function() {
      if (done) {
        done();
      }
    });
  });
}

describe('user appears', function() {
  it('shows user name', function(done) {
    createUser('test', function(err) {
      if (err) {
        return done(err);
      }
      requestProfile('test', done, function(res) {
        assert.include(res.text, 'test');
        wrapup(done);
      });
    });
  });

  it('profile has no photos', function(done) {
    createUser('test', function(err) {
      if (err) {
        return done(err);
      }
      requestProfile('test', done, function(res) {
        assert.include(res.text, 'hasn\'t posted yet!');
        wrapup(done);
      });
    });
  });
});

describe('photo uploaded', function() {
  it('is hidden when not public', function(done) {
    createUser('test', function(err, user) {
      if (err) {
        return done(err);
      }
      createImage(user, false, function(err) {
        if (err) {
          return done(err);
        }
        requestProfile('test', done, function(res) {
          assert.include(res.text, 'hasn\'t posted yet!');
          wrapup(done);
        });
      });
    });
  });

  it('is visible once user has published', function(done) {
    createUser('test', function(err, user) {
      if (err) {
        return done(err);
      }
      createImage(user, true, function(err, img) {
        if (err) {
          return done(err);
        }
        user.images = [img.src];
        user.imageids = [img._id];
        user.posted = new Date();
        user.save(function(err) {
          if (err) {
            return done(err);
          }
          requestProfile('test', done, function(res) {
            assert.notInclude(res.text, 'hasn\'t posted yet!');
            assert.include(res.text, '/test/photo/' + img._id);
            wrapup(done);
          });
        });
      });
    });
  });

  it('gets its own page once user has published', function(done) {
    createUser('test', function(err, user) {
      if (err) {
        return done(err);
      }
      createImage(user, true, function(err, img) {
        if (err) {
          return done(err);
        }
        user.images = [img.src];
        user.imageids = [img._id];
        user.posted = new Date();
        user.save(function(err) {
          if (err) {
            return done(err);
          }
          requestImage('test', img._id, done, function(res) {
            assert.include(res.text, 'http://example.com');
            wrapup(done);
          });
        });
      });
    });
  });
});
