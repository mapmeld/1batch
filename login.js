const passport = require('passport');
const Strategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const crypto = require('crypto');

const User = require('./models/user.js');
const printError = require('./common.js').error;

var middleware = function(req, res, next) {
  if (process.env.GOOGLE_CONSUMER_KEY && process.env.GOOGLE_CLIENT_SECRET) {
    //passport.authenticate('google', { scope: ['email'], failureRedirect: '/login' })(req, res, next);
    next();
  } else {
    passport.authenticate('local', function(err, user, info) {
      req.authenticated = !! user;
      next();
    })(req, res, next);
  }
};

var confirmLogin = function (req, res, next) {
  // this runs once, after the callback from Google
  passport.authenticate('google', { scope: ['email'], failureRedirect: '/login' })(req, res, next);
};

var pwdhash = function (pwd, salt, fn) {
  var len = 128;
  var iterations = 12000;
  if (3 == arguments.length) {
    crypto.pbkdf2(pwd, salt, iterations, len, function(err, hash){
      fn(err, hash.toString('base64'));
    });
  } else {
    fn = salt;
    crypto.randomBytes(len, function(err, salt){
      if (err) return fn(err);
      salt = salt.toString('base64');
      crypto.pbkdf2(pwd, salt, iterations, len, function(err, hash){
        if (err) return fn(err);
        fn(null, salt, hash.toString('base64'));
      });
    });
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
        callbackURL: 'https://1batch.co/profile?justLoggedIn=true',
        passReqToCallback: true
      },
      function(request, accessToken, refreshToken, profile, done) {
        User.findOne({ googid: profile.id }, function (err, user) {
          if (!user) {
            user = new User();
            user.googid = profile.id;
            user.name = profile.email;
            user.test = false;
            user.republish = false;
            user.save(function() {
              return done(err, user);
            });
          } else {
            return done(err, user);
          }
        });
      }
    ));
  }

  passport.use(new Strategy(function(username, password, cb) {
    User.findOne({ name: username.toLowerCase() }, function(err, user) {
      if (err) { return cb(err); }
      if (!user) { return cb(null, false); }
      pwdhash(password, user.salt, function (err, hash) {
        if (err) { return cb(err); }
        if (hash !== user.localpass) { return cb(null, false); }
        return cb(null, user);
      });
    });
  }));

  passport.serializeUser(function(user, done) {
    done(null, user);
  });

  passport.deserializeUser(function(obj, done) {
    done(null, obj);
  });

  app.post('/login', passport.authenticate('local', { failureRedirect: '/login' }), csrfProtection, function (req, res) {
    if (req.user.posted) {
      res.redirect('/feed');
    } else {
      res.redirect('/profile');
    }
  });

  app.get('/login', csrfProtection, function (req, res) {
    res.render('login', {
      forUser: req.user,
      csrfToken: req.csrfToken(),
      newuser: req.query.user,
      googly: (process.env.GOOGLE_CONSUMER_KEY && process.env.GOOGLE_CLIENT_SECRET)
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
      pwdhash(req.body.password, function (err, salt, hash) {
        if (err) {
          return printError(res, err);
        }
        var u = new User();
        u.name = req.body.username.toLowerCase();
        u.localpass = hash;
        u.salt = salt;
        u.test = false;
        u.republish = false;
        u.save(function (err) {
          if (err) {
            return printError(err, res);
          }
          res.redirect('/login?user=' + u.name);
        });
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
  setupAuth: setupAuth,
  confirmLogin: confirmLogin
};
