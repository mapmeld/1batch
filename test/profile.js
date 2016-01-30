/*global it, describe*/

const assert = require('chai').assert;

const createUser = require('./common.js').createUser;
const createImage = require('./common.js').createImage;
const requestProfile = require('./common.js').requestProfile;
const wrapup = require('./common.js').wrapup;

describe('profile page visibility', function() {
  it('indicates when user is missing', function(done) {
    requestProfile('test', done, function(res) {
      assert.include(res.text, 'can\'t find that user');
      wrapup(done);
    });
  });

  it('doesn\'t show e-mail profiles', function(done) {
    createUser('nick@1batch.co', function(err) {
      if (err) {
        return wrapup(done, err);
      }
      requestProfile('nick@1batch.co', done, function(res) {
        assert.include(res.text, 'can\'t find that user');
        wrapup(done);
      });
    });
  });

  it('shows user name but no photos', function(done) {
    createUser('test', function(err) {
      if (err) {
        return wrapup(done, err);
      }
      requestProfile('test', done, function(res) {
        assert.include(res.text, 'test');
        assert.include(res.text, 'hasn\'t posted yet!');
        wrapup(done);
      });
    });
  });
});

describe('photo on profile page', function() {
  it('is hidden when not public', function(done) {
    createUser('test', function(err, user) {
      if (err) {
        return wrapup(done, err);
      }
      createImage('test', false, function(err) {
        if (err) {
          return wrapup(done, err);
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
        return wrapup(done, err);
      }
      createImage('test', true, function(err, img) {
        if (err) {
          return wrapup(done, err);
        }
        user.posted = new Date();
        user.save(function(err) {
          if (err) {
            return wrapup(done, err);
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

  it('doesn\'t show if user published other images instead', function(done) {
    createUser('test', function(err, user) {
      if (err) {
        return wrapup(done, err);
      }
      createImage('test', false, function(err, img) {
        if (err) {
          return wrapup(done, err);
        }
        user.posted = new Date();
        user.save(function(err) {
          if (err) {
            return wrapup(done, err);
          }
          requestProfile('test', done, function(res) {
            assert.notInclude(res.text, 'hasn\'t posted yet!');
            assert.notInclude(res.text, '/test/photo/' + img._id);
            wrapup(done);
          });
        });
      });
    });
  });

  it('goes away when user hides an image', function(done) {
    createUser('test', function(err, user) {
      if (err) {
        return wrapup(done, err);
      }
      createImage('test', true, function(err, img) {
        if (err) {
          return wrapup(done, err);
        }
        user.posted = new Date();
        user.save(function(err) {
          if (err) {
            return wrapup(done, err);
          }
          img.hidden = true;
          img.save(function(err) {
            if (err) {
              return wrapup(done, err);
            }
            requestProfile('test', done, function(res) {
              assert.notInclude(res.text, 'hasn\'t posted yet!');
              assert.notInclude(res.text, '/test/photo/' + img._id);
              wrapup(done);
            });
          });
        });
      });
    });
  });
});
