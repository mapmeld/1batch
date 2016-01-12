/* @flow */

var express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
var compression = require('compression');
var mongoose = require('mongoose');
var multer = require('multer');
var ms3 = require('multer-s3');
var csrf = require('csurf');

const User = require('./models/user.js');
const Image = require('./models/image.js');
const Follow = require('./models/following.js');

var setupAuth = require('./login.js').setupAuth;
var middleware = require('./login.js').middleware;

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

app.get('/:username/photo/:photoid', csrfProtection, function (req, res) {
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
        forUser: (req.user || null),
        csrfToken: req.csrfToken()
      });
    });
  });
});

app.get('/profile/:username', middleware, csrfProtection, function (req, res) {
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
        following: following,
        csrfToken: req.csrfToken()
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

app.get('/profile', middleware, csrfProtection, function (req, res) {
  if (!req.user) {
    return res.redirect('/login');
  }
  res.render('profile', {
    user: req.user,
    forUser: req.user,
    csrfToken: req.csrfToken()
  });
});

app.post('/follow/:end_user', middleware, csrfProtection, function (req, res) {
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

app.post('/testupload', middleware, csrfProtection, function (req, res) {
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

app.listen(process.env.PORT || 8080, function() { });

module.exports = app;
