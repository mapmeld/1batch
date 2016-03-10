/* @flow */

const path = require('path');

const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const convert = require('koa-convert');
const session = require('koa-generic-session');
const MongoStore = require('koa-generic-session-mongo');
const jade = require('koa-jade-render');
const logger = require('koa-logger');
const router = require('koa-router')();
const compression = require('koa-compress');
const mongoose = require('mongoose');
const csrf = require('koa-csrf');
const kstatic = require('koa-static');

const thunkify = require('thunkify');
require('nodent')();

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

var app = new Koa();
app.use(jade(path.join(__dirname, 'views')));

app.use(convert(kstatic(__dirname + '/static')));
app.use(bodyParser());
app.use(compression());
//app.use(cookieParser());

app.keys = ['wkpow3jocijoid3jioj3', 'cekopjpdjjo3jcjio3jc'];
app.use(convert(session({
  store: new MongoStore()
})));

app.use(logger());
csrf(app);
app.use(convert(csrf.middleware));

// routes

function* authCheck(next) {
  console.log(ctx.passport);
  console.log(ctx.passport.user);
  if (ctx.isAuthenticated()) {
    yield next;
  } else {
    ctx.redirect('/login');
  }
}

router.get('/', home)
  .get('/profile', authCheck, myProfile)
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

function home (ctx) {
  ctx.render('index');
}

// your own profile
async function myProfile (ctx) {
  console.log('in the zone');
  var requser = (ctx.req.user || ctx.request.user);
  if (!requser.name || requser.name.indexOf('@') > -1) {
    return ctx.redirect('/changename');
  }
  if (!requser.republish && requser.posted && (new Date() - requser.posted) > 6 * 30 * 24 * 60 * 60 * 1000) {
    // >180 days ago!
    var user = yield User.findById(requser._id).exec();
    user.republish = true;
    requser.republish = true;
    user = yield user.save();
    return ctx.redirect('/profile');
  }
  var allimages = yield Image.find({ user_id: requser.name }).select('_id src picked published hidden').exec();
  var images = [];
  var saved = [];
  allimages.map(function(img) {
    if (img.published) {
      images.push(responsiveImg(img));
    } else {
      saved.push(responsiveImg(img));
    }
  });
  if (requser.posted && !requser.republish) {
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

  ctx.render('profile', {
    user: requser,
    images: images,
    saved: saved,
    posted: cleanDate(requser.posted),
    forUser: requser,
    csrfToken: ctx.csrf
  });
}

function changeName (ctx) {
  if (!requser) {
    return ctx.redirect('/login');
  }
  if (requser.name && requser.name.indexOf('@') === -1) {
    return ctx.redirect('/profile');
  }
  ctx.render('changename', {
    forUser: requser,
    csrfToken: ctx.csrf
  });
}

function postChangeName (ctx) {
  if (!requser) {
    return ctx.redirect('/login');
  }
  if (requser.name && requser.name.indexOf('@') > -1) {
    return ctx.redirect('/profile');
  }
  var newname = ctx.body.newname.toLowerCase();
  if (!newname || newname.indexOf('@') > -1) {
    return ctx.redirect('/changename');
  }
  var users = yield User.find({ name: newname }).exec();
  if (users.length) {
    return printError(res, 'someone already has that username');
  }
  var user = yield User.findById(requser._id).exec();
  requser.name = newname;
  user.name = newname;
  user = yield user.save();
  ctx.redirect('/profile');
}

// friends' photos
function feed (ctx) {
  if (requser) {
    var follows = yield Follow.find({ start_user_id: requser.name, blocked: false }).exec();
    var permDate = new Date((new Date()) - 60 * 60 * 1000);
    var publishers = yield User.find({ published: { $ne: null, $lt: permDate } }).sort('-published').limit(6).exec();

    ctx.render('feed', {
      follows: follows,
      forUser: requser,
      publishers: publishers
    });
  } else {
    ctx.redirect('/');
  }
}

// someone else's profile
function theirProfile (ctx) {
  if (requser && ctx.params.username.toLowerCase() === requser.name) {
    // redirect to your own profile
    return ctx.redirect('/profile');
  }
  if (ctx.params.username.indexOf('@') > -1) {
    return printNoExist(res);
  }
  var user = yield User.findOne({ name: ctx.params.username.toLowerCase() }, '_id name posted').exec();
  if (!user) {
    return printNoExist(ctx);
  }

  var follows = yield following(requser, user, ctx);
  var images = yield Image.find({ published: true, hidden: false, user_id: user.name }).select('_id src').exec();
  images = images.map(responsiveImg);
  ctx.render('profile', {
    user: user,
    images: images,
    saved: [],
    posted: cleanDate(user.posted),
    forUser: (requser || null),
    following: follows,
    csrfToken: ctx.csrf
  });
}

// view a published image
function photo (ctx) {
  var user = yield User.findOne({ name: ctx.params.username.toLowerCase() }).exec();
  if (!user || !user.posted) {
    return printNoExist(res);
  }

  var userFollowsSource = yield following(requser, user, res);
  var sourceFollowsUser = yield following(user, requser, res);
  var image = yield Image.findOne({ _id: ctx.params.photoid }, '_id src comments caption hidden published').exec();
  if (!image) {
    return printNoExist(res);
  }
  if (!requser || requser.name !== user.name) {
    if (image.hidden || !image.published) {
      return printNoExist(res);
    }
  }
  comments = image.comments || [];
  image = responsiveImg(image, true);
  ctx.render('image', {
    user: user,
    image: image,
    comments: comments,
    posted: cleanDate(user.posted),
    forUser: (requser || null),
    csrfToken: ctx.csrf,
    following: userFollowsSource,
    canComment: requser && ((requser.name === user.name) || userFollowsSource || sourceFollowsUser)
  });
}

// follow another user
function follow (ctx) {
  if (!requser) {
    // log in first
    return ctx.redirect('/login');
  }
  if (requser.name === ctx.params.end_user) {
    return printError('you can\'t follow yourself', res);
  }
  if (ctx.params.end_user.indexOf('@') > -1) {
    return printNoExist(res);
  }
  var existing = yield Follow.findOne({ start_user_id: requser.name, end_user_id: ctx.params.end_user }).exec();
  if (ctx.body.makeFollow === 'true') {
    if (existing) {
      // follow already exists
      return printError('you already follow', res);
    }

    var f = new Follow({
      start_user_id: requser.name,
      end_user_id: ctx.params.end_user,
      blocked: false,
      test: false
    });
    f = yield f.save();
    ctx.json({ status: 'success' });
  } else {
    if (!existing) {
      return printError('you already don\'t follow', res);
    }
    yield Follow.remove({ start_user_id: requser.name, end_user_id: ctx.params.end_user, blocked: false }).exec();
    ctx.json({ status: 'success' });
  }
}

// block another user
function block (ctx) {
  if (!requser) {
    // log in first
    return ctx.redirect('/login');
  }
  if (requser.name === ctx.body.banuser) {
    return printError('you can\'t block yourself', res);
  }
  // remove a follow in either direction
  yield Follow.remove({ start_user_id: requser.name, end_user_id: ctx.body.banuser, blocked: false }).exec();
  yield Follow.remove({ start_user_id: ctx.body.banuser, end_user_id: requser.name, blocked: false }).exec();

  // create a new block
  var f = new Follow({
    start_user_id: ctx.body.banuser,
    end_user_id: requser.name,
    blocked: true,
    test: false
  });
  f = yield f.save();

  var img = yield Image.findById(ctx.body.id).exec();
  if (img) {
    for (var c = img.comments.length - 1; c >= 0; c--) {
      if (img.comments[c].user === ctx.body.banuser) {
        img.comments.splice(c, 1);
      }
    }
    img = yield img.save();
    ctx.render('block', { exist: true });
  } else {
    ctx.render('block', { exist: false });
  }
}

// pick an image
function pick (ctx) {
  if (!requser) {
    // log in first
    return ctx.redirect('/login');
  }
  if (requser.posted) {
    // would immediately publish, and we don't allow that
    return printError('you already posted', res);
  }
  var imgcount = yield Image.update({ _id: ctx.body.id, user_id: requser.name },
    { picked: (ctx.body.makePick === 'true') }).exec();
  if (!imgcount) {
    return printError('that isn\'t your image', res);
  }
  ctx.json({ status: 'success' });
}

function getHide (ctx) {
  ctx.render('hide');
}

function postHide (ctx) {
  if (!requser) {
    // log in first
    return ctx.redirect('/login');
  }
  var imgcount = yield Image.update({ _id: ctx.body.id, user_id: requser.name }, { hidden: (ctx.body.makeHide === 'true') }).exec();
  if (!imgcount) {
    return printError('that isn\'t your image', res);
  }
  if (ctx.body.makeHide === 'true') {
    ctx.redirect('/hide');
  } else {
    ctx.redirect('/' + requser.name + '/photo/' + ctx.body.id);
  }
}

function makedelete (ctx) {
  if (!requser) {
    // log in first
    return ctx.redirect('/login');
  }
  yield Image.remove({ _id: ctx.body.id, user_id: requser.name }).exec();
  ctx.redirect('/hide');
}

// publish picked images
function publish (ctx) {
  if (!requser) {
    // log in first
    return ctx.redirect('/login');
  }
  if (ctx.body.makePublish === 'true') {
    // publish
    if (requser.posted) {
      return printError('you already posted', res);
    }
    var count = yield Image.count({ user_id: requser.name, picked: true, hidden: false }).exec();
    if (!count) {
      return printError('you have no picked images', res);
    }
    if (count > 8) {
      return printError('you have too many picked images', res);
    }
    yield User.update({ name: requser.name }, { posted: (new Date()) }).exec();
    requser.posted = new Date();
    yield Image.update({ user_id: requser.name, picked: true, hidden: false }, { published: true }, { multi: true });
    ctx.json({ status: 'success' });
  } else {
    // un-publish within 60 minutes
    if (!requser.posted) {
      return printError('you have not posted', res);
    }
    if ((new Date()) - requser.posted > 60 * 60 * 1000) {
      return printError('too much time has passed. you can remove images but not re-publish', res);
    }
    yield User.update({ name: requser.name }, { posted: null }).exec();
    requser.posted = null;
    yield Image.update({ user_id: requser.name }, { published: false }, { multi: true });
    ctx.json({ status: 'success' });
  }
}

// comment on photo
function comment (ctx) {
  var requser = ctx.request.user;
  if (!requser) {
    // log in first
    return ctx.redirect('/login');
  }
  var img = yield Image.findById(ctx.body.id).exec();
  if (!img || img.hidden || !img.published) {
    return printNoExist(err, res);
  }
  var user = yield User.findOne({ name: img.user_id }).exec();
  if (!user) {
    return printNoExist(err, res);
  }
  var userFollowsSource = yield following(requser, user, res);
  var sourceFollowsUser = yield following(user, requser, res);
  if ((requser.name === user.name) || userFollowsSource || sourceFollowsUser) {
    if (!img.comments) {
      img.comments = [];
    }
    img.comments.push({ user: requser.name, text: ctx.body.text.trim() });
    img = yield img.save();
    ctx.redirect('/' + user.name + '/photo/' + ctx.body.id);
  } else {
    return printError('you can\'t comment', res);
  }
}

app.use(router.routes())
  .use(router.allowedMethods());

app.listen(process.env.PORT || 8080);

module.exports = app;
