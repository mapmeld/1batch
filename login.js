const route = require('koa-route');
const passport = require('koa-passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const crypto = require('crypto');
const thunkify = require('thunkify');

const User = require('./models/user.js');
const printError = require('./common.js').error;

var middleware = function(ctx, next) {
  if (process.env.GOOGLE_CONSUMER_KEY && process.env.GOOGLE_CLIENT_SECRET) {
    return passport.authenticate('google', { scope: ['email'], failureRedirect: '/login' });
  } else {
    return passport.authenticate('local', {});
  }
};

var confirmLogin = function (next) {
  // this runs once, after the callback from Google
  passport.authenticate('google', { scope: ['email'], failureRedirect: '/login' })(next);
};

var setupAuth = function (app, router) {
  app.use(passport.initialize());
  app.use(passport.session());

  router.post('/login', postLogin)
    .get('/login', getLogin)
    .post('/register', postRegister)
    .get('/register', getRegister)
    .get('/bye', bye)
    .get('/logout', logout);

  if (process.env.GOOGLE_CONSUMER_KEY && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CONSUMER_KEY,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: 'https://1batch.co/profile?justLoggedIn=true',
        passReqToCallback: true
      },
      function(request, accessToken, refreshToken, profile, done) {
        User.findOne({ googid: profile.id }).exec(function (err, user) {
          if (!user) {
            user = new User({
              googid: profile.id,
              name: profile.email,
              test: false,
              republish: false
            });
            user.save(function (err) {
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
    User.findOne({ name: username.toLowerCase() }).exec(function (err, user) {
      if (!user) { return cb(null, false); }
      var len = 128;
      var iterations = 12000;
      crypto.pbkdf2(password, user.salt, iterations, len, function (err, hash) {
        hash = hash.toString('base64');
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

  function *postLogin (next) {
    var ctx = this;
    yield* passport.authenticate('local', function*(err, user, info) {
      if (err) {
        throw err;
      }
      if (!user) {
        return ctx.redirect('/login');
      } else if (user.posted) {
        //yield ctx.login(user);
        return ctx.redirect('/feed');
      } else {
        //yield ctx.login(user);
        return ctx.redirect('/profile');
      }
    }).call(this, next);
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
    var username = this.request.body.username.trim().toLowerCase();
    var pwd = this.request.body.password;
    var users = yield User.find({ name: username }).exec();
    if (users.length) {
      return printError(this, 'user with that name already exists');
    }

    var len = 128;
    var iterations = 12000;
    var salt = yield thunkify(crypto.randomBytes)(len);
    salt = salt.toString('base64');
    var hash = yield thunkify(crypto.pbkdf2)(pwd, salt, iterations, len);
    hash = hash.toString('base64');
    var u = new User({
      name: username,
      localpass: hash,
      salt: salt,
      test: false,
      republish: false
    });
    u = yield u.save();
    this.redirect('/login?user=' + username);
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
