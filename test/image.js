/*global it, describe*/

const assert = require('chai').assert;

const createUser = require('./common.js').createUser;
const createImage = require('./common.js').createImage;
const requestImage = require('./common.js').requestImage;
const wrapup = require('./common.js').wrapup;

describe('photo page', function() {
  it('is invisible until user has published', function(done) {
    createUser('test', function(err, user) {
      if (err) {
        return done(err);
      }
      createImage('test', true, function(err, img) {
        if (err) {
          return done(err);
        }
        requestImage('test', img._id, done, function(res) {
          assert.include(res.text, 'can\'t find that user or image');
          wrapup(done);
        });
      });
    });
  });

  it('gets its own page once user has published', function(done) {
    createUser('test', function(err, user) {
      if (err) {
        return done(err);
      }
      createImage('test', true, function(err, img) {
        if (err) {
          return done(err);
        }
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

  it('doesn\'t show if user published other images instead', function(done) {
    createUser('test', function(err, user) {
      if (err) {
        return done(err);
      }
      createImage('test', false, function(err, img) {
        if (err) {
          return done(err);
        }
        user.posted = new Date();
        user.save(function(err) {
          if (err) {
            return done(err);
          }
          requestImage('test', img._id, done, function(res) {
            assert.include(res.text, 'can\'t find that user or image');
            wrapup(done);
          });
        });
      });
    });
  });

  it('goes away when user hides an image', function(done) {
    createUser('test', function(err, user) {
      if (err) {
        return done(err);
      }
      createImage('test', true, function(err, img) {
        if (err) {
          return done(err);
        }
        user.posted = new Date();
        user.save(function(err) {
          if (err) {
            return done(err);
          }
          img.hidden = true;
          img.save(function(err) {
            if (err) {
              return done(err);
            }
            requestImage('test', img._id, done, function(res) {
              assert.include(res.text, 'can\'t find that user or image');
              wrapup(done);
            });
          });
        });
      });
    });
  });
});
