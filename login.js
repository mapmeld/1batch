const passport = require('koa-passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const crypto = require('crypto');

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

  router.post('/login', passport.authenticate('local', {
      successRedirect: '/profile?justLoggedIn=true',
      failureRedirect: '/login'
    }))
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
      var hash = crypto.pbkdf2Sync(password, user.salt, iterations, len, 'sha256');
      hash = hash.toString('base64');
      if (hash !== user.localpass) { return cb(null, false); }
      return cb(null, user);
    });
  }));

  passport.serializeUser(function(user, done) {
    done(null, user._id);
  });

  passport.deserializeUser(function(id, done) {
    User.findById(id, done);
  });

  function getLogin (ctx, next) {
    var requser = (ctx.req.user || ctx.request.user);
    ctx.render('login', {
      forUser: requser,
      csrfToken: ctx.csrf,
      newuser: ctx.query.user,
      googly: (process.env.GOOGLE_CONSUMER_KEY && process.env.GOOGLE_CLIENT_SECRET)
    });
  }

  function getRegister (ctx, next) {
    var requser = (ctx.req.user || ctx.request.user);
    if (requser) {
      return ctx.redirect('/profile');
    }
    ctx.render('register', {
      csrfToken: ctx.csrf
    });
  }

  function bye (ctx, next) {
    var requser = (ctx.req.user || ctx.request.user);
    if (requser) {
      ctx.redirect('/logout');
    } else {
      ctx.render('bye');
    }
  }

  async function postRegister (ctx, next) {
    var username = ctx.request.body.username.trim().toLowerCase();
    var pwd = ctx.request.body.password;
    var users = await User.find({ name: username }).exec();
    if (users.length) {
      return printError(ctx, 'user with that name already exists');
    }

    var len = 128;
    var iterations = 12000;
    var salt, hash;
    salt = await crypto.randomBytes(len);
    salt = salt.toString('base64');
    hash = crypto.pbkdf2Sync(pwd, salt, iterations, len, 'sha256');
    hash = hash.toString('base64');

    var u = new User({
      name: username,
      localpass: hash,
      salt: salt,
      test: false,
      republish: false
    });
    u = await u.save();
    ctx.redirect('/login?user=' + username);
  }

  function logout (ctx, next) {
    ctx.logout();
    ctx.redirect('/bye');
  }

  //app.get('/auth/google', passport.authenticate('google', { scope: ['email'], failureRedirect: '/login' }));
};

module.exports = {
  middleware: middleware,
  setupAuth: setupAuth,
  confirmLogin: confirmLogin
};
