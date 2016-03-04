/* @flow */

const koa = require('koa');
const bodyParser = require('koa-bodyparser');
const convert = require('koa-convert');
const session = require('koa-generic-session');
const MongoStore = require('koa-generic-session-mongo');
const Jade = require('koa-jade');
const logger = require('koa-logger');
const router = require('koa-router')();
const compression = require('koa-compress');
const mongoose = require('mongoose');
const csrf = require('koa-csrf');
const kstatic = require('koa-static');

const thunkify = require('thunkify');

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
var following = thunkify(require('./common.js').following);
var cleanDate = require('./common.js').cleanDate;

console.log('Connecting to MongoDB (required)');
mongoose.connect(process.env.MONGOLAB_URI || process.env.MONGODB_URI || 'localhost');
mongoose.connection.on("error", function(err) {
  console.log(err);
});

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
csrf(app);
app.use(csrf.middleware);

// routes
router.get('/', home)
  .get('/profile', myProfile)
  .get('/:username/photo/:photoid', photo)
  .get('/changename', changeName)
  .post('/changename', postChangeName)
  .get('/feed', feed)
  .get('/profile/:username', theirProfile)
  .post('/comment', comment)
  .post('/publish', publish)
  .post('/delete', makedelete)
  .post('/block', block)
  .post('/hide', postHide)
  .get('/hide', getHide)
  .post('/follow/:end_user', follow)
  .post('/pick', pick);

setupAuth(app, router);
setupUploads(app, router);

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
    var user = yield User.findById(this.user._id).exec();
    user.republish = true;
    this.user.republish = true;
    user = yield user.save();
    return this.redirect('/profile');
  }
  var allimages = yield Image.find({ user_id: this.user.name }).select('_id src picked published hidden').exec();
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
  var users = yield User.find({ name: newname }).exec();
  if (users.length) {
    return printError(res, 'someone already has that username');
  }
  var user = yield User.findById(this.user._id).exec();
  this.user.name = newname;
  user.name = newname;
  user = yield user.save();
  this.redirect('/profile');
}

// friends' photos
function *feed () {
  if (this.user) {
    var follows = yield Follow.find({ start_user_id: this.user.name, blocked: false }).exec();
    var permDate = new Date((new Date()) - 60 * 60 * 1000);
    var publishers = yield User.find({ published: { $ne: null, $lt: permDate } }).sort('-published').limit(6).exec();

    this.render('feed', {
      follows: follows,
      forUser: this.user,
      publishers: publishers
    });
  } else {
    this.redirect('/');
  }
}

// someone else's profile
function *theirProfile () {
  if (this.user && this.params.username.toLowerCase() === this.user.name) {
    // redirect to your own profile
    return this.redirect('/profile');
  }
  if (this.params.username.indexOf('@') > -1) {
    return printNoExist(res);
  }
  var user = yield User.findOne({ name: this.params.username.toLowerCase() }, '_id name posted').exec();
  if (!user) {
    return printNoExist(this);
  }

  var follows = yield following(this.user, user, this);
  var images = yield Image.find({ published: true, hidden: false, user_id: user.name }).select('_id src').exec();
  images = images.map(responsiveImg);
  this.render('profile', {
    user: user,
    images: images,
    saved: [],
    posted: cleanDate(user.posted),
    forUser: (this.user || null),
    following: follows,
    csrfToken: this.csrf
  });
}

// view a published image
function *photo () {
  var user = yield User.findOne({ name: this.params.username.toLowerCase() }).exec();
  if (!user || !user.posted) {
    return printNoExist(res);
  }

  var userFollowsSource = yield following(this.user, user, res);
  var sourceFollowsUser = yield following(user, this.user, res);
  var image = yield Image.findOne({ _id: this.params.photoid }, '_id src comments caption hidden published').exec();
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
  var existing = yield Follow.findOne({ start_user_id: this.user.name, end_user_id: this.params.end_user }).exec();
  if (this.body.makeFollow === 'true') {
    if (existing) {
      // follow already exists
      return printError('you already follow', res);
    }

    var f = new Follow({
      start_user_id: this.user.name,
      end_user_id: this.params.end_user,
      blocked: false,
      test: false
    });
    f = yield f.save();
    this.json({ status: 'success' });
  } else {
    if (!existing) {
      return printError('you already don\'t follow', res);
    }
    yield Follow.remove({ start_user_id: this.user.name, end_user_id: this.params.end_user, blocked: false }).exec();
    this.json({ status: 'success' });
  }
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
  yield Follow.remove({ start_user_id: this.user.name, end_user_id: this.body.banuser, blocked: false }).exec();
  yield Follow.remove({ start_user_id: this.body.banuser, end_user_id: this.user.name, blocked: false }).exec();

  // create a new block
  var f = new Follow({
    start_user_id: this.body.banuser,
    end_user_id: this.user.name,
    blocked: true,
    test: false
  });
  f = yield f.save();

  var img = yield Image.findById(this.body.id).exec();
  if (img) {
    for (var c = img.comments.length - 1; c >= 0; c--) {
      if (img.comments[c].user === this.body.banuser) {
        img.comments.splice(c, 1);
      }
    }
    img = yield img.save();
    this.render('block', { exist: true });
  } else {
    this.render('block', { exist: false });
  }
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
  var imgcount = yield Image.update({ _id: this.body.id, user_id: this.user.name },
    { picked: (this.body.makePick === 'true') }).exec();
  if (!imgcount) {
    return printError('that isn\'t your image', res);
  }
  this.json({ status: 'success' });
}

function *getHide () {
  this.render('hide');
}

function *postHide () {
  if (!this.user) {
    // log in first
    return this.redirect('/login');
  }
  var imgcount = yield Image.update({ _id: this.body.id, user_id: this.user.name }, { hidden: (this.body.makeHide === 'true') }).exec();
  if (!imgcount) {
    return printError('that isn\'t your image', res);
  }
  if (this.body.makeHide === 'true') {
    this.redirect('/hide');
  } else {
    this.redirect('/' + this.user.name + '/photo/' + this.body.id);
  }
}

function *makedelete () {
  if (!this.user) {
    // log in first
    return this.redirect('/login');
  }
  yield Image.remove({ _id: this.body.id, user_id: this.user.name }).exec();
  this.redirect('/hide');
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
    var count = yield Image.count({ user_id: this.user.name, picked: true, hidden: false }).exec();
    if (!count) {
      return printError('you have no picked images', res);
    }
    if (count > 8) {
      return printError('you have too many picked images', res);
    }
    yield User.update({ name: this.user.name }, { posted: (new Date()) }).exec();
    this.user.posted = new Date();
    yield Image.update({ user_id: this.user.name, picked: true, hidden: false }, { published: true }, { multi: true });
    this.json({ status: 'success' });
  } else {
    // un-publish within 60 minutes
    if (!this.user.posted) {
      return printError('you have not posted', res);
    }
    if ((new Date()) - this.user.posted > 60 * 60 * 1000) {
      return printError('too much time has passed. you can remove images but not re-publish', res);
    }
    yield User.update({ name: this.user.name }, { posted: null }).exec();
    this.user.posted = null;
    yield Image.update({ user_id: this.user.name }, { published: false }, { multi: true });
    this.json({ status: 'success' });
  }
}

// comment on photo
function *comment () {
  if (!this.user) {
    // log in first
    return this.redirect('/login');
  }
  var img = yield Image.findById(this.body.id).exec();
  if (!img || img.hidden || !img.published) {
    return printNoExist(err, res);
  }
  var user = yield User.findOne({ name: img.user_id }).exec();
  if (!user) {
    return printNoExist(err, res);
  }
  var userFollowsSource = yield following(this.user, user, res);
  var sourceFollowsUser = yield following(user, this.user, res);
  if ((this.user.name === user.name) || userFollowsSource || sourceFollowsUser) {
    if (!img.comments) {
      img.comments = [];
    }
    img.comments.push({ user: this.user.name, text: this.body.text.trim() });
    img = yield img.save();
    this.redirect('/' + user.name + '/photo/' + this.body.id);
  } else {
    return printError('you can\'t comment', res);
  }
}

app.use(router.routes())
  .use(router.allowedMethods());

app.listen(process.env.PORT || 8080);

module.exports = app;
