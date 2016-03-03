const route = require('koa-route');
const passport = require('koa-passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const crypto = require('crypto');

const User = require('./models/user.js');
const printError = require('./common.js').error;

var middleware = function(next) {
  if (process.env.GOOGLE_CONSUMER_KEY && process.env.GOOGLE_CLIENT_SECRET) {
    //passport.authenticate('google', { scope: ['email'], failureRedirect: '/login' })(, next);
    next();
  } else {
    passport.authenticate('local', function(err, user, info) {
      this.authenticated = !! user;
      next();
    })(next);
  }
};

var confirmLogin = function (next) {
  // this runs once, after the callback from Google
  passport.authenticate('google', { scope: ['email'], failureRedirect: '/login' })(next);
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

  app.use(route.post('/login', postLogin));
  app.use(route.get('/login', getLogin));
  app.use(route.post('/register', postRegister));
  app.use(route.get('/register', getRegister));
  app.use(route.get('/bye', bye));
  app.use(route.get('/logout', logout));

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

  passport.use(new LocalStrategy(function(username, password, cb) {
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

  function *postLogin (ctx, next) {
    yield* passport.authenticate('local', function(user, info, status) {
      if (!user) {
        ctx.redirect('/login');
      } else if (user.posted) {
        ctx.login(user);
        //ctx.redirect('/feed');
      } else {
        return ctx.login(user);
        //ctx.redirect('/profile');
      }
    }).call(ctx, next);
  }

  function *getLogin () {
    this.render('login', {
      forUser: this.user,
      csrfToken: this.csrf,
      newuser: this.query.user,
      googly: (process.env.GOOGLE_CONSUMER_KEY && process.env.GOOGLE_CLIENT_SECRET)
    });
  }

  function *getRegister () {
    if (this.user) {
      return this.redirect('/login');
    }
    this.render('register', {
      csrfToken: this.csrf
    });
  }

  function *bye () {
    if (this.user) {
      this.redirect('/logout');
    } else {
      this.render('bye');
    }
  }

  function *postRegister () {
    User.find({ name: this.body.username.toLowerCase() }, function (err, users) {
      if (err) {
        return printError(res, err);
      }
      if (users.length) {
        return printError(res, 'user with that name already exists');
      }
      pwdhash(this.body.password, function (err, salt, hash) {
        if (err) {
          return printError(res, err);
        }
        var u = new User();
        u.name = this.body.username.toLowerCase();
        u.localpass = hash;
        u.salt = salt;
        u.test = false;
        u.republish = false;
        u.save(function (err) {
          if (err) {
            return printError(err, res);
          }
          this.redirect('/login?user=' + u.name);
        });
      });
    });
  }

  function *logout () {
    this.logout();
    this.redirect('/bye');
  }

  //app.get('/auth/google', passport.authenticate('google', { scope: ['email'], failureRedirect: '/login' }));
};

module.exports = {
  middleware: middleware,
  setupAuth: setupAuth,
  confirmLogin: confirmLogin
};
