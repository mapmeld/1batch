/* @flow */

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
const compression = require('compression');
const mongoose = require('mongoose');
const csrf = require('csurf');

const User = require('./models/user.js');
const Image = require('./models/image.js');
const Follow = require('./models/following.js');

var setupAuth = require('./login.js').setupAuth;
var middleware = require('./login.js').middleware;
var setupUploads = require('./uploads.js');

var printError = require('./common.js').error;
var printNoExist = require('./common.js').noExist;
var responsiveImg = require('./common.js').responsiveImg;
var following = require('./common.js').following;
var cleanDate = require('./common.js').cleanDate;

console.log('Connecting to MongoDB (required)');
mongoose.connect(process.env.MONGOLAB_URI || process.env.MONGODB_URI || 'localhost');

var app = express();
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express['static'](__dirname + '/static'));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(compression());
app.use(cookieParser());
app.use(session({
  store: new MongoStore({
    mongooseConnection: mongoose.connection
  }),
  secret: process.env.SESSION || 'fj23f90jfoijfl2mfp293i019eoijdoiqwj129',
  resave: false,
  saveUninitialized: false
}));

var csrfProtection = csrf({ cookie: true });
setupAuth(app, csrfProtection);

setupUploads(app, csrfProtection);

// homepage
app.get('/', function (req, res) {
  res.render('index');
});

// your own profile
app.get('/profile', middleware, csrfProtection, function (req, res) {
  if (!req.user) {
    // log in first
    return res.redirect('/login');
  }
  var user = req.user;
  Image.find({ user_id: user.name }).select('_id src picked published hidden').exec(function (err, allimages) {
    if (err) {
      return printError(err, res);
    }

    var images = [];
    var saved = [];
    allimages.map(function(img) {
      if (img.published) {
        images.push(responsiveImg(img));
      } else {
        saved.push(responsiveImg(img));
      }
    });
    if (user.posted) {
      // once user posts, end photo-picking
      saved = [];
    }
    saved.sort(function(a, b) {
      // show picked photos first
      if (a.picked && !b.picked) {
        return -1;
      } else if (a.picked !== b.picked) {
        return 1;
      }
      return 0;
    });

    res.render('profile', {
      user: user,
      images: images,
      saved: saved,
      posted: cleanDate(user.posted),
      forUser: req.user,
      csrfToken: req.csrfToken()
    });
  });
});

// friends' photos
app.get('/feed', middleware, csrfProtection, function (req, res) {
  if (req.user) {
    Follow.find({ start_user_id: req.user.name, blocked: false }, function (err, follows) {
      if (err) {
        return printError(err, res);
      }
      var permDate = new Date((new Date()) - 60 * 60 * 1000);
      User.find({ published: { $ne: null, $lt: permDate } }).sort('-published').limit(6).exec(function (err, publishers) {
        if (err) {
          return printError(err, res);
        }
        res.render('feed', {
          follows: follows,
          forUser: req.user,
          publishers: publishers
        });
      });
    });
  } else {
    res.redirect('/');
  }
});

// someone else's profile
app.get('/profile/:username', middleware, csrfProtection, function (req, res) {
  if (req.user && req.params.username.toLowerCase() === req.user.name) {
    // redirect to your own profile
    return res.redirect('/profile');
  }
  User.findOne({ name: req.params.username.toLowerCase() }, '_id name posted', function (err, user) {
    if (err) {
      return printError(err, res);
    }
    if (!user) {
      return printNoExist(res);
    }

    function showProfile(following) {
      Image.find({ published: true, hidden: false, user_id: user.name }).select('_id src').exec(function (err, images) {
        if (err) {
          return printError(err, res);
        }
        images = images.map(responsiveImg);
        res.render('profile', {
          user: user,
          images: images,
          saved: [],
          posted: cleanDate(user.posted),
          forUser: (req.user || null),
          following: following,
          csrfToken: req.csrfToken()
        });
      });
    }
    following(req.user, user, res, showProfile);
  });
});

// view a published image
app.get('/:username/photo/:photoid', middleware, csrfProtection, function (req, res) {
  User.findOne({ name: req.params.username.toLowerCase() }, function (err, user) {
    if (err) {
      return printError(err, res);
    }
    if (!user || !user.posted) {
      return printNoExist(res);
    }

    function showImage(userFollowsSource, sourceFollowsUser) {
      Image.findOne({ _id: req.params.photoid }, '_id src comments caption hidden published', function (err, image) {
        if (err) {
          return printError(err, res);
        }
        if (!image) {
          return printNoExist(res);
        }
        if ((req.user.name !== user.name) && (image.hidden || !image.published)) {
          return printNoExist(res);
        }
        comments = image.comments || [];
        image = responsiveImg(image, true);
        res.render('image', {
          user: user,
          image: image,
          comments: comments,
          posted: cleanDate(user.posted),
          forUser: (req.user || null),
          csrfToken: req.csrfToken(),
          canComment: (req.user.name === user.name) || userFollowsSource || sourceFollowsUser
        });
      });
    }

    following(req.user, user, res, function (userFollowsSource) {
      following(user, req.user, res, function (sourceFollowsUser) {
        showImage(userFollowsSource, sourceFollowsUser);
      });
    });
  });
});

// follow another user
app.post('/follow/:end_user', middleware, csrfProtection, function (req, res) {
  if (!req.user) {
    // log in first
    return res.redirect('/login');
  }
  Follow.findOne({ start_user_id: req.user.name, end_user_id: req.params.end_user }, function (err, existing) {
    if (err) {
      return printError(err, res);
    }
    if (req.body.makeFollow === 'true') {
      if (existing) {
        // follow already exists
        return printError('you already follow', res);
      }

      var f = new Follow();
      f.start_user_id = req.user.name;
      f.end_user_id = req.params.end_user;
      f.blocked = false;
      f.test = false;
      f.save(function (err) {
        if (err) {
          return printError(err, res);
        }
        res.json({ status: 'success' });
      });
    } else {
      if (!existing) {
        return printError('you already don\'t follow', res);
      }
      Follow.remove({ start_user_id: req.user.name, end_user_id: req.params.end_user, blocked: false }, function (err) {
        if (err) {
          return printError(err, res);
        }
        res.json({ status: 'success' });
      });
    }
  });
});

// pick an image
app.post('/pick', middleware, csrfProtection, function (req, res) {
  if (!req.user) {
    // log in first
    return res.redirect('/login');
  }
  if (req.user.posted) {
    // would immediately publish, and we don't allow that
    return printError('you already posted', res);
  }
  Image.update({ _id: req.body.id, user_id: req.user.name },
    { picked: (req.body.makePick === 'true') },
    function (err, imgcount) {
    if (err) {
      return printError(err, res);
    }
    if (!imgcount) {
      return printError('that isn\'t your image', res);
    }
    res.json({ status: 'success' });
  });
});

app.get('/hide', middleware, csrfProtection, function (req, res) {
  res.render('hide');
});

app.post('/hide', middleware, csrfProtection, function (req, res) {
  if (!req.user) {
    // log in first
    return res.redirect('/login');
  }
  Image.update({ _id: req.body.id, user_id: req.user.name }, { hidden: (req.body.makeHide === 'true') }, function (err, imgcount) {
    if (err) {
      return printError(err, res);
    }
    if (!imgcount) {
      return printError('that isn\'t your image', res);
    }
    if (req.body.makeHide === 'true') {
      res.redirect('/hide');
    } else {
      res.redirect('/' + req.user.name + '/photo/' + req.body.id);
    }
  });
});

app.post('/delete', middleware, csrfProtection, function (req, res) {
  if (!req.user) {
    // log in first
    return res.redirect('/login');
  }
  Image.remove({ _id: req.body.id, user_id: req.user.name }, function (err) {
    if (err) {
      return printError(err, res);
    }
    res.redirect('/hide');
  });
});

// publish picked images
app.post('/publish', middleware, csrfProtection, function (req, res) {
  if (!req.user) {
    // log in first
    return res.redirect('/login');
  }
  if (req.body.makePublish === 'true') {
    // publish
    if (req.user.posted) {
      return printError('you already posted', res);
    }
    Image.count({ user_id: req.user.name, picked: true, hidden: false }, function (err, count) {
      if (err) {
        return printError(err, res);
      }
      if (!count) {
        return printError('you have no picked images', res);
      }
      if (count > 8) {
        return printError('you have too many picked images', res);
      }
      User.update({ name: req.user.name }, { posted: (new Date()) }, function(err) {
        if (err) {
          return printError(err, res);
        }
        Image.update({ user_id: req.user.name, picked: true, hidden: false }, { published: true }, { multi: true }, function(err) {
          if (err) {
            return printError(err, res);
          }
          res.json({ status: 'success' });
        });
      });
    });
  } else {
    // un-publish within 60 minutes
    if (!req.user.posted) {
      return printError('you have not posted', res);
    }
    if ((new Date()) - req.user.posted > 60 * 60 * 1000) {
      return printError('too much time has passed. you can remove images but not re-publish', res);
    }
    User.update({ name: req.user.name }, { posted: null }, function(err) {
      if (err) {
        return printError(err, res);
      }
      Image.update({ user_id: req.user.name }, { published: false }, { multi: true }, function(err) {
        if (err) {
          return printError(err, res);
        }
        res.json({ status: 'success' });
      });
    });
  }
});

// comment on photo
app.post('/comment', middleware, csrfProtection, function (req, res) {
  if (!req.user) {
    // log in first
    return res.redirect('/login');
  }
  Image.findById(req.body.id, function (err, img) {
    if (err) {
      return printError(err, res);
    }
    if (!img || img.hidden || !img.published) {
      return printNoExist(err, res);
    }
    User.findOne({ name: img.user_id }, function (err, user) {
      if (err) {
        return printError(err, res);
      }
      if (!user) {
        return printNoExist(err, res);
      }
      following(req.user, user, res, function (userFollowsSource) {
        following(user, req.user, res, function (sourceFollowsUser) {
          if ((req.user.name === user.name) || userFollowsSource || sourceFollowsUser) {
            if (!img.comments) {
              img.comments = [];
            }
            img.comments.push({ user: user.name, text: req.body.text.trim() });
            img.save(function (err){
              if (err) {
                return printError(err, res);
              }
              res.redirect('/' + user.name + '/photo/' + req.body.id);
            });
          } else {
            return printError('you can\'t comment', res);
          }
        });
      });
    });
  });
});

app.listen(process.env.PORT || 8080, function() { });

module.exports = app;
