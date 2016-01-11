/* @flow */

var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var compression = require('compression');
var mongoose = require('mongoose');
var passport = require('passport');
var Strategy = require('passport-local').Strategy;
var GoogleStrategy = require('passport-google-oauth2').Strategy;
var multer = require('multer');
var ms3 = require('multer-s3');
var User = require('./models/user.js');
var Image = require('./models/image.js');
var Follow = require('./models/following.js');

mongoose.connect(process.env.MONGOLAB_URI || process.env.MONGODB_URI || 'localhost');

var app = express();
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express['static'](__dirname + '/static'));
app.use(bodyParser({ limit: '50mb' }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(compression());
app.use(cookieParser());
app.use(session({ secret: process.env.GOOGLE_SESSION || 'fj23f90jfoijfl2mfp293i019eoijdoiqwj129', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

var middleware = function(req, res, next) {
  passport.authenticate('local', function(err, user, info) {
    req.authenticated = !! user;
    next();
  })(req, res, next);
};

var upload;
if (process.env.S3_BUCKET && process.env.AWS_SECRET_KEY && process.env.AWS_ACCESS_KEY) {
  upload = multer({
    storage: ms3({
      dirname: 'maps',
      bucket: process.env.S3_BUCKET,
      secretAccessKey: process.env.AWS_SECRET_KEY,
      accessKeyId: process.env.AWS_ACCESS_KEY,
      region: 'ap-southeast-1',
      filename: function (req, file, cb) {
        cb(null, Date.now());
      }
    })
  });

  app.post('/upload', upload.single('upload'), function (req, res) {
    res.render('index');
  });
}

function printError (err, res) {
  res.json({ status: 'error', error: err });
}

function printNoExist (res) {
  res.json({ status: 'missing', error: 'can\'t find that user or image' });
}

app.get('/', function (req, res) {
  res.render('index');
});

app.get('/login', function (req, res) {
  res.render('login', {
    forUser: req.user
  });
});

app.get('/bye', function (req, res) {
  if (req.user) {
    res.redirect('/logout');
  } else {
    res.render('bye');
  }
});

app.post('/register', function (req, res) {
  var u = new User();
  u.name = req.body.username;
  u.localpass = req.body.password;
  u.test = false;
  u.save(function (err) {
    if (err) {
      return printError(err, res);
    }
    res.redirect('/login');
  });
});

app.post('/login', passport.authenticate('local', { failureRedirect: '/login' }), function (req, res) {
  res.redirect('/profile');
});

app.get('/logout', function (req, res) {
  req.logout();
  res.redirect('/bye');
});

app.get('/:username/photo/:photoid', function (req, res) {
  User.findOne({ name: req.params.username }, function (err, user) {
    if (err) {
      return printError(err, res);
    }
    if (!user) {
      return printNoExist(res);
    }
    Image.findOne({ _id: req.params.photoid, hidden: false }, function (err, image) {
      if (err) {
        return printError(err, res);
      }
      if (!image) {
        return printNoExist(res);
      }
      res.render('image', {
        user: user,
        image: image,
        forUser: (req.user || null)
      });
    });
  });
});

app.get('/profile/:username', middleware, function (req, res) {
  User.findOne({ name: req.params.username }, function (err, user) {
    if (err) {
      return printError(err, res);
    }
    if (!user) {
      return printNoExist(res);
    }

    function showProfile(following) {
      res.render('profile', {
        user: user,
        forUser: (req.user || null),
        following: following
      });
    }
    if (req.user) {
      Follow.findOne({ start_user_id: req.user.name, end_user_id: user.name }, function (err, f) {
        if (err) {
          return printError(err, res);
        }
        if (f) {
          if (f.blocked) {
            return printNoExist(res);
          } else {
            return showProfile(true);
          }
        } else {
          return showProfile(false);
        }
      });
    } else {
      showProfile(false);
    }
  });
});

app.get('/profile', middleware, function (req, res) {
  if (!req.user) {
    return res.redirect('/login');
  }
  res.render('profile', {
    user: req.user,
    forUser: req.user
  });
});

app.get('/follow/:end_user', middleware, function (req, res) {
  if (!req.user) {
    return res.redirect('/login');
  }
  Follow.findOne({ start_user_id: req.user.name, end_user_id: req.params.end_user }, function (err, existing) {
    if (err) {
      return printError(err, res);
    }
    if (existing) {
      return res.redirect('/profile');
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
      res.redirect('/profile/' + req.params.end_user);
    });
  });
});

app.get('/auth/google',
  passport.authenticate('google', { scope: ['email'] }));


app.post('/testupload', middleware, function (req, res) {
  if (!req.user) {
    return res.redirect('/login');
  }
  var i = new Image();
  i.user_id = req.user.name;
  i.src = '/images/home1.jpg';
  i.hidden = true;
  i.test = false;
  i.save(function (err) {
    if (err) {
      return printError(err, res);
    }
    req.user.images.push(i.src);
    req.user.imageids.push(i._id);
    req.user.save(function (err) {
      if (err) {
        return printError(err, res);
      }
      res.redirect('/profile');
    });
  });
});

app.get('/upload',
  passport.authenticate('google', { failureRedirect: '/' }),
  function(req, res) {
    res.redirect('/uploader');
  });

if (process.env.GOOGLE_CONSUMER_KEY && process.env.GOOGLE_CONSUMER_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CONSUMER_KEY,
      clientSecret: process.env.GOOGLE_CONSUMER_SECRET,
      callbackURL: 'http://1batch.co/profile',
      passReqToCallback: true
    },
    function(request, accessToken, refreshToken, profile, done) {
      User.findOne({ id: profile.id }, function (err, user) {
        if (!user) {
          user = new User();
        }
        return done(err, user);
      });
    }
  ));

  passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(function(id, done) {
    User.findOne({ id: id }, function(err, user) {
      done(err, user);
    });
  });
} else {
  passport.use(new Strategy(
    function(username, password, cb) {
      User.findOne({ name: username }, function(err, user) {
        if (err) { return cb(err); }
        if (!user) { return cb(null, false); }
        if (user.localpass != password) { return cb(null, false); }
        return cb(null, user);
      });
    })
  );

  passport.serializeUser(function(user, cb) {
    cb(null, user._id);
  });

  passport.deserializeUser(function(id, cb) {
    User.findById(id, function (err, user) {
      if (err) { return cb(err); }
      cb(null, user);
    });
  });
}

app.listen(process.env.PORT || 8080, function() { });

module.exports = app;
