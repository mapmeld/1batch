var passport = require('passport');
var Strategy = require('passport-local').Strategy;
var GoogleStrategy = require('passport-google-oauth2').Strategy;

var User = require('./models/user.js');

var middleware = function(req, res, next) {
  passport.authenticate('local', function(err, user, info) {
    req.authenticated = !! user;
    next();
  })(req, res, next);
};

var setupAuth = function (app, csrfProtection) {
  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/login', csrfProtection, function (req, res) {
    res.render('login', {
      forUser: req.user,
      csrfToken: req.csrfToken()
    });
  });

  app.get('/bye', function (req, res) {
    if (req.user) {
      res.redirect('/logout');
    } else {
      res.render('bye');
    }
  });

  app.post('/register', csrfProtection, function (req, res) {
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

  app.post('/login', passport.authenticate('local', { failureRedirect: '/login' }), csrfProtection, function (req, res) {
    res.redirect('/profile');
  });

  app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/bye');
  });

  app.get('/auth/google', passport.authenticate('google', { scope: ['email'] }));

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
};

module.exports = {
  middleware: middleware,
  setupAuth: setupAuth
}
