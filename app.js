/* @flow */

const koa = require('koa');
const bodyParser = require('koa-bodyparser');
const convert = require('koa-convert');
const session = require('koa-generic-session');
const MongoStore = require('koa-generic-session-mongo');
const Jade = require('koa-jade');
const logger = require('koa-logger');
const route = require('koa-route');
const compression = require('koa-compress');
const mongoose = require('mongoose');
const csrf = require('koa-csrf');
const kstatic = require('koa-static');

const User = require('./models/user.js');
const Image = require('./models/image.js');
const Follow = require('./models/following.js');

var setupAuth = require('./login.js').setupAuth;
var middleware = require('./login.js').middleware;
var confirmLogin = require('./login.js').confirmLogin;
var setupUploads = require('./uploads.js');

var printError = require('./common.js').error;
var printNoExist = require('./common.js').noExist;
var responsiveImg = require('./common.js').responsiveImg;
var following = require('./common.js').following;
var cleanDate = require('./common.js').cleanDate;

console.log('Connecting to MongoDB (required)');
mongoose.connect(process.env.MONGOLAB_URI || process.env.MONGODB_URI || 'localhost');

var app = koa();
const jade = new Jade({
  viewPath: './views'
});
app.use(jade.middleware);

app.use(kstatic(__dirname + '/static'));
app.use(bodyParser());
app.use(compression());
//app.use(cookieParser());

app.keys = ['wkpow3jocijoid3jioj3', 'cekopjpdjjo3jcjio3jc'];
app.use(session({
  store: new MongoStore()
}));

app.use(logger());

var csrfProtection = csrf()(app);
setupAuth(app, csrfProtection);

setupUploads(app, csrfProtection);

// homepage
app.use(route.get('/', home));
app.use(route.get('/profile', myProfile));
app.use(route.get('/:username/photo/:photoid', photo));
app.use(route.get('/changename', changeName));
app.use(route.post('/changename', postChangeName));
app.use(route.get('/feed', feed));
app.use(route.get('/profile/:username', yourProfile));
app.use(route.post('/comment', comment));
app.use(route.post('/publish', publish));
app.use(route.post('/delete', makedelete));
app.use(route.post('/block', block));
app.use(route.post('/hide', postHide));
app.use(route.get('/hide', getHide));
app.use(route.post('/follow/:end_user', follow));
app.use(route.post('/pick', pick));

function *home () {
  this.render('index');
}

// your own profile
function *myProfile () {
  if (!this.user) {
    // log in first
    return this.redirect('/login');
  }
  if (!this.user.name || this.user.name.indexOf('@') > -1) {
    return this.redirect('/changename');
  }
  if (!this.user.republish && this.user.posted && (new Date() - this.user.posted) > 6 * 30 * 24 * 60 * 60 * 1000) {
    // >180 days ago!
    return User.findById(this.user._id, function (err, user) {
      if (err) {
        return printError(err, res);
      }
      user.republish = true;
      this.user.republish = true;
      user.save(function (err) {
        if (err) {
          return printError(err, res);
        }
        this.redirect('/profile');
      });
    });
  }
  Image.find({ user_id: this.user.name }).select('_id src picked published hidden').exec(function (err, allimages) {
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
    if (this.user.posted && !this.user.republish) {
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

    this.render('profile', {
      user: this.user,
      images: images,
      saved: saved,
      posted: cleanDate(this.user.posted),
      forUser: this.user,
      csrfToken: this.csrf
    });
  });
}

function *changeName () {
  if (!this.user) {
    return this.redirect('/login');
  }
  if (this.user.name && this.user.name.indexOf('@') === -1) {
    return this.redirect('/profile');
  }
  this.render('changename', {
    forUser: this.user,
    csrfToken: this.csrf
  });
}

function *postChangeName () {
  if (!this.user) {
    return this.redirect('/login');
  }
  if (this.user.name && this.user.name.indexOf('@') > -1) {
    return this.redirect('/profile');
  }
  var newname = this.body.newname.toLowerCase();
  if (!newname || newname.indexOf('@') > -1) {
    return this.redirect('/changename');
  }
  User.find({ name: newname }, function (err, users) {
    if (err) {
      return printError(res, err);
    }
    if (users.length) {
      return printError(res, 'someone already has that username');
    }
    User.findById(this.user._id, function (err, user) {
      if (err) {
        return printError(res, err);
      }
      this.user.name = newname;
      user.name = newname;
      user.save(function (err) {
        if (err) {
          return printError(res, err);
        }
        this.redirect('/profile');
      });
    });
  });
}

// friends' photos
function *feed () {
  if (this.user) {
    Follow.find({ start_user_id: this.user.name, blocked: false }, function (err, follows) {
      if (err) {
        return printError(err, res);
      }
      var permDate = new Date((new Date()) - 60 * 60 * 1000);
      User.find({ published: { $ne: null, $lt: permDate } }).sort('-published').limit(6).exec(function (err, publishers) {
        if (err) {
          return printError(err, res);
        }
        this.render('feed', {
          follows: follows,
          forUser: this.user,
          publishers: publishers
        });
      });
    });
  } else {
    this.redirect('/');
  }
}

// someone else's profile
function *yourProfile () {
  if (this.user && this.params.username.toLowerCase() === this.user.name) {
    // redirect to your own profile
    return this.redirect('/profile');
  }
  if (this.params.username.indexOf('@') > -1) {
    return printNoExist(res);
  }
  User.findOne({ name: this.params.username.toLowerCase() }, '_id name posted', function (err, user) {
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
        this.render('profile', {
          user: user,
          images: images,
          saved: [],
          posted: cleanDate(user.posted),
          forUser: (this.user || null),
          following: following,
          csrfToken: this.csrf
        });
      });
    }
    following(this.user, user, res, showProfile);
  });
}

// view a published image
function *photo () {
  User.findOne({ name: this.params.username.toLowerCase() }, function (err, user) {
    if (err) {
      return printError(err, res);
    }
    if (!user || !user.posted) {
      return printNoExist(res);
    }

    function showImage(userFollowsSource, sourceFollowsUser) {
      Image.findOne({ _id: this.params.photoid }, '_id src comments caption hidden published', function (err, image) {
        if (err) {
          return printError(err, res);
        }
        if (!image) {
          return printNoExist(res);
        }
        if (!this.user || this.user.name !== user.name) {
          if (image.hidden || !image.published) {
            return printNoExist(res);
          }
        }
        comments = image.comments || [];
        image = responsiveImg(image, true);
        this.render('image', {
          user: user,
          image: image,
          comments: comments,
          posted: cleanDate(user.posted),
          forUser: (this.user || null),
          csrfToken: this.csrf,
          following: userFollowsSource,
          canComment: this.user && ((this.user.name === user.name) || userFollowsSource || sourceFollowsUser)
        });
      });
    }

    following(this.user, user, res, function (userFollowsSource) {
      following(user, this.user, res, function (sourceFollowsUser) {
        showImage(userFollowsSource, sourceFollowsUser);
      });
    });
  });
}

// follow another user
function *follow () {
  if (!this.user) {
    // log in first
    return this.redirect('/login');
  }
  if (this.user.name === this.params.end_user) {
    return printError('you can\'t follow yourself', res);
  }
  if (this.params.end_user.indexOf('@') > -1) {
    return printNoExist(res);
  }
  Follow.findOne({ start_user_id: this.user.name, end_user_id: this.params.end_user }, function (err, existing) {
    if (err) {
      return printError(err, res);
    }
    if (this.body.makeFollow === 'true') {
      if (existing) {
        // follow already exists
        return printError('you already follow', res);
      }

      var f = new Follow();
      f.start_user_id = this.user.name;
      f.end_user_id = this.params.end_user;
      f.blocked = false;
      f.test = false;
      f.save(function (err) {
        if (err) {
          return printError(err, res);
        }
        this.json({ status: 'success' });
      });
    } else {
      if (!existing) {
        return printError('you already don\'t follow', res);
      }
      Follow.remove({ start_user_id: this.user.name, end_user_id: this.params.end_user, blocked: false }, function (err) {
        if (err) {
          return printError(err, res);
        }
        this.json({ status: 'success' });
      });
    }
  });
}

// block another user
function *block () {
  if (!this.user) {
    // log in first
    return this.redirect('/login');
  }
  if (this.user.name === this.body.banuser) {
    return printError('you can\'t block yourself', res);
  }
  // remove a follow in either direction
  Follow.remove({ start_user_id: this.user.name, end_user_id: this.body.banuser, blocked: false }, function (err) {
    if (err) {
      return printError(err, res);
    }
    Follow.remove({ start_user_id: this.body.banuser, end_user_id: this.user.name, blocked: false }, function (err) {
      if (err) {
        return printError(err, res);
      }

      // create a new block
      var f = new Follow();
      f.start_user_id = this.body.banuser;
      f.end_user_id = this.user.name;
      f.blocked = true;
      f.test = false;
      f.save(function (err) {
        if (err) {
          return printError(err, res);
        }
        Image.findById(this.body.id, function (err, img) {
          if (err) {
            return printError(err, res);
          }
          if (img) {
            for (var c = img.comments.length - 1; c >= 0; c--) {
              if (img.comments[c].user === this.body.banuser) {
                img.comments.splice(c, 1);
              }
            }
            img.save(function(err) {
              if (err) {
                return printError(err, res);
              }
              this.render('block', { exist: true });
            });
          } else {
            this.render('block', { exist: false });
          }
        });
      });
    });
  });
}

// pick an image
function *pick () {
  if (!this.user) {
    // log in first
    return this.redirect('/login');
  }
  if (this.user.posted) {
    // would immediately publish, and we don't allow that
    return printError('you already posted', res);
  }
  Image.update({ _id: this.body.id, user_id: this.user.name },
    { picked: (this.body.makePick === 'true') },
    function (err, imgcount) {
    if (err) {
      return printError(err, res);
    }
    if (!imgcount) {
      return printError('that isn\'t your image', res);
    }
    this.json({ status: 'success' });
  });
}

function *getHide () {
  this.render('hide');
}

function *postHide () {
  if (!this.user) {
    // log in first
    return this.redirect('/login');
  }
  Image.update({ _id: this.body.id, user_id: this.user.name }, { hidden: (this.body.makeHide === 'true') }, function (err, imgcount) {
    if (err) {
      return printError(err, res);
    }
    if (!imgcount) {
      return printError('that isn\'t your image', res);
    }
    if (this.body.makeHide === 'true') {
      this.redirect('/hide');
    } else {
      this.redirect('/' + this.user.name + '/photo/' + this.body.id);
    }
  });
}

function *makedelete () {
  if (!this.user) {
    // log in first
    return this.redirect('/login');
  }
  Image.remove({ _id: this.body.id, user_id: this.user.name }, function (err) {
    if (err) {
      return printError(err, res);
    }
    this.redirect('/hide');
  });
}

// publish picked images
function *publish () {
  if (!this.user) {
    // log in first
    return this.redirect('/login');
  }
  if (this.body.makePublish === 'true') {
    // publish
    if (this.user.posted) {
      return printError('you already posted', res);
    }
    Image.count({ user_id: this.user.name, picked: true, hidden: false }, function (err, count) {
      if (err) {
        return printError(err, res);
      }
      if (!count) {
        return printError('you have no picked images', res);
      }
      if (count > 8) {
        return printError('you have too many picked images', res);
      }
      User.update({ name: this.user.name }, { posted: (new Date()) }, function(err) {
        if (err) {
          return printError(err, res);
        }
        this.user.posted = new Date();
        Image.update({ user_id: this.user.name, picked: true, hidden: false }, { published: true }, { multi: true }, function(err) {
          if (err) {
            return printError(err, res);
          }
          this.json({ status: 'success' });
        });
      });
    });
  } else {
    // un-publish within 60 minutes
    if (!this.user.posted) {
      return printError('you have not posted', res);
    }
    if ((new Date()) - this.user.posted > 60 * 60 * 1000) {
      return printError('too much time has passed. you can remove images but not re-publish', res);
    }
    User.update({ name: this.user.name }, { posted: null }, function(err) {
      if (err) {
        return printError(err, res);
      }
      this.user.posted = null;
      Image.update({ user_id: this.user.name }, { published: false }, { multi: true }, function(err) {
        if (err) {
          return printError(err, res);
        }
        this.json({ status: 'success' });
      });
    });
  }
}

// comment on photo
function *comment () {
  if (!this.user) {
    // log in first
    return this.redirect('/login');
  }
  Image.findById(this.body.id, function (err, img) {
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
      following(this.user, user, res, function (userFollowsSource) {
        following(user, this.user, res, function (sourceFollowsUser) {
          if ((this.user.name === user.name) || userFollowsSource || sourceFollowsUser) {
            if (!img.comments) {
              img.comments = [];
            }
            img.comments.push({ user: this.user.name, text: this.body.text.trim() });
            img.save(function (err){
              if (err) {
                return printError(err, res);
              }
              this.redirect('/' + user.name + '/photo/' + this.body.id);
            });
          } else {
            return printError('you can\'t comment', res);
          }
        });
      });
    });
  });
}

app.listen(process.env.PORT || 8080);

module.exports = app;
