const passport = require('passport');
const Strategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth2').Strategy;

const User = require('./models/user.js');
const printError = require('./common.js').error;

var middleware = function(req, res, next) {
  if (process.env.GOOGLE_CONSUMER_KEY && process.env.GOOGLE_CLIENT_SECRET) {
    next();
  } else {
    passport.authenticate('local', function(err, user, info) {
      req.authenticated = !! user;
      next();
    })(req, res, next);
  }
};

var setupAuth = function (app, csrfProtection) {
  app.use(passport.initialize());
  app.use(passport.session());

  if (process.env.GOOGLE_CONSUMER_KEY && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CONSUMER_KEY,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: 'http://1batch.co/profile?justLoggedIn=true',
        passReqToCallback: true
      },
      function(request, accessToken, refreshToken, profile, done) {
        User.findOne({ googid: profile.id }, function (err, user) {
          if (!user) {
            user = new User();
            user.googid = profile.id;
            user.save(function() {
              return done(err, user);
            });
          } else {
            return done(err, user);
          }
        });
      }
    ));

    passport.serializeUser(function(user, done) {
      done(null, user.googid);
    });

    passport.deserializeUser(function(id, done) {
      User.findOne({ googid: id }, function(err, user) {
        done(err, user);
      });
    });
  } else {
    passport.use(new Strategy(
      function(username, password, cb) {
        User.findOne({ name: username.toLowerCase() }, function(err, user) {
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
        if (err) {
          return cb(err);
        }
        cb(null, user);
      });
    });
  }

  app.get('/login', middleware, csrfProtection, function (req, res) {
    res.render('login', {
      forUser: req.user,
      csrfToken: req.csrfToken(),
      newuser: req.query.user
    });
  });

  app.get('/register', middleware, csrfProtection, function (req, res) {
    if (req.user) {
      return res.redirect('/login');
    }
    res.render('register', {
      csrfToken: req.csrfToken()
    });
  });

  app.get('/bye', middleware, csrfProtection, function (req, res) {
    if (req.user) {
      res.redirect('/logout');
    } else {
      res.render('bye');
    }
  });

  app.post('/register', middleware, csrfProtection, function (req, res) {
    User.find({ name: req.body.username.toLowerCase() }, function (err, users) {
      if (err) {
        return printError(res, err);
      }
      if (users.length) {
        return printError(res, 'user with that name already exists');
      }
      var u = new User();
      u.name = req.body.username.toLowerCase();
      u.localpass = req.body.password;
      u.test = false;
      u.save(function (err) {
        if (err) {
          return printError(err, res);
        }
        res.redirect('/login?user=' + u.name);
      });
    });
  });

  app.get('/logout', middleware, csrfProtection, function (req, res) {
    req.logout();
    res.redirect('/bye');
  });

  app.get('/auth/google', passport.authenticate('google', { scope: ['email'], failureRedirect: '/login' }));
};

module.exports = {
  middleware: middleware,
  setupAuth: setupAuth
};
