/* @flow */

var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var compression = require('compression');
var mongoose = require('mongoose');
var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth2').Strategy;
var multer = require('multer');
var ms3 = require('multer-s3');

var User = require('./models/user.js');

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
app.use(session({ secret: process.env.GOOGLE_SESSION || 'fj23f90jfoijfl2mfp293i019eoijdoiqwj129' }));
app.use(passport.initialize());
app.use(passport.session());

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

app.get('/', function (req, res) {
  res.render('index');
});

app.get('/auth/google',
  passport.authenticate('google', { scope: ['email'] }));

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
}

app.listen(process.env.PORT || 8080, function() { });

module.exports = app;
