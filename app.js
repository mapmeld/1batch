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

function authCheck(ctx, next) {
  if (ctx.isAuthenticated()) {
    return next();
  } else {
    ctx.redirect('/login');
  }
}

router.get('/', home)
  .get('/profile', authCheck, myProfile)
  .get('/:username/photo/:photoid', photo)
  .get('/changename', authCheck, changeName)
  .post('/changename', authCheck, postChangeName)
  .get('/feed', authCheck, feed)
  .get('/profile/:username', theirProfile)
  .post('/comment', authCheck, comment)
  .post('/publish', authCheck, publish)
  .post('/delete', authCheck, makedelete)
  .post('/block', authCheck, block)
  .post('/hide', authCheck, postHide)
  .get('/hide', authCheck, getHide)
  .post('/follow/:end_user', authCheck, follow)
  .post('/pick', authCheck, pick);

setupAuth(app, router);
setupUploads(app, router);

async function home (ctx) {
  ctx.render('index');
}

// your own profile
async function myProfile (ctx, next) {
  var requser = (ctx.req.user || ctx.request.user);
  if (!requser.name || requser.name.indexOf('@') > -1) {
    return ctx.redirect('/changename');
  }
  if (!requser.republish && requser.posted && (new Date() - requser.posted) > 6 * 30 * 24 * 60 * 60 * 1000) {
    // >180 days ago!
    var user = await User.findById(requser._id).exec();
    user.republish = true;
    requser.republish = true;
    user = await user.save();
    return ctx.redirect('/profile');
  }
  var allimages = await Image.find({ user_id: requser.name }).select('_id src picked published hidden').exec();
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
  var requser = (ctx.req.user || ctx.request.user);
  if (requser.name && requser.name.indexOf('@') === -1) {
    return ctx.redirect('/profile');
  }
  ctx.render('changename', {
    forUser: requser,
    csrfToken: ctx.csrf
  });
}

async function postChangeName (ctx) {
  var requser = (ctx.req.user || ctx.request.user);
  if (requser.name && requser.name.indexOf('@') > -1) {
    return ctx.redirect('/profile');
  }
  var newname = ctx.request.body.newname.toLowerCase();
  if (!newname || newname.indexOf('@') > -1) {
    return ctx.redirect('/changename');
  }
  var users = await User.find({ name: newname }).exec();
  if (users.length) {
    return printError(ctx, 'someone already has that username');
  }
  var user = await User.findById(requser._id).exec();
  requser.name = newname;
  user.name = newname;
  user = await user.save();
  ctx.redirect('/profile');
}

// friends' photos
async function feed (ctx) {
  var requser = (ctx.req.user || ctx.request.user);
  if (requser) {
    var follows = await Follow.find({ start_user_id: requser.name, blocked: false }).exec();
    var permDate = new Date((new Date()) - 60 * 60 * 1000);
    var publishers = await User.find({ published: { $ne: null, $lt: permDate } }).sort('-published').limit(6).exec();

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
async function theirProfile (ctx) {
  var requser = (ctx.req.user || ctx.request.user);
  if (requser && ctx.params.username.toLowerCase() === requser.name) {
    // redirect to your own profile
    return ctx.redirect('/profile');
  }
  if (ctx.params.username.indexOf('@') > -1) {
    return printNoExist(ctx);
  }
  var user = await User.findOne({ name: ctx.params.username.toLowerCase() }, '_id name posted').exec();
  if (!user) {
    return printNoExist(ctx);
  }

  var follows = await following(requser, user, ctx);
  var images = await Image.find({ published: true, hidden: false, user_id: user.name }).select('_id src').exec();
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
async function photo (ctx) {
  var requser = (ctx.req.user || ctx.request.user);
  var user = await User.findOne({ name: ctx.params.username.toLowerCase() }).exec();
  if (!user || !user.posted) {
    return printNoExist(ctx);
  }

  var userFollowsSource = await following(requser, user, ctx);
  var sourceFollowsUser = await following(user, requser, ctx);
  var image = await Image.findOne({ _id: ctx.params.photoid }, '_id src comments caption hidden published').exec();
  if (!image) {
    return printNoExist(ctx);
  }
  if (!requser || requser.name !== user.name) {
    if (image.hidden || !image.published) {
      return printNoExist(ctx);
    }
  }
  var comments = image.comments || [];
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
async function follow (ctx) {
  var requser = (ctx.req.user || ctx.request.user);
  if (requser.name === ctx.params.end_user) {
    return printError('you can\'t follow yourself', ctx);
  }
  if (ctx.params.end_user.indexOf('@') > -1) {
    return printNoExist(ctx);
  }
  var existing = await Follow.findOne({ start_user_id: requser.name, end_user_id: ctx.params.end_user }).exec();
  if (ctx.request.body.makeFollow === 'true') {
    if (existing) {
      // follow already exists
      return printError('you already follow', ctx);
    }

    var f = new Follow({
      start_user_id: requser.name,
      end_user_id: ctx.params.end_user,
      blocked: false,
      test: false
    });
    f = await f.save();
    ctx.body = { status: 'success' };
  } else {
    if (!existing) {
      return printError('you already don\'t follow', ctx);
    }
    await Follow.remove({ start_user_id: requser.name, end_user_id: ctx.params.end_user, blocked: false }).exec();
    ctx.body = { status: 'success' };
  }
}

// block another user
async function block (ctx) {
  var requser = (ctx.req.user || ctx.request.user);
  if (requser.name === ctx.request.body.banuser) {
    return printError('you can\'t block yourself', ctx);
  }
  // remove a follow in either direction
  await Follow.remove({ start_user_id: requser.name, end_user_id: ctx.request.body.banuser, blocked: false }).exec();
  await Follow.remove({ start_user_id: ctx.request.body.banuser, end_user_id: requser.name, blocked: false }).exec();

  // create a new block
  var f = new Follow({
    start_user_id: ctx.request.body.banuser,
    end_user_id: requser.name,
    blocked: true,
    test: false
  });
  f = await f.save();

  var img = await Image.findById(ctx.request.body.id).exec();
  if (img) {
    if (!img.comments) {
      img.comments = [];
    }
    for (var c = img.comments.length - 1; c >= 0; c--) {
      if (img.comments[c].user === ctx.request.body.banuser) {
        img.comments.splice(c, 1);
      }
    }
    img = await img.save();
    ctx.render('block', { exist: true });
  } else {
    ctx.render('block', { exist: false });
  }
}

// pick an image
async function pick (ctx) {
  var requser = (ctx.req.user || ctx.request.user);
  if (requser.posted) {
    // would immediately publish, and we don't allow that
    return printError('you already posted', ctx);
  }
  var imgcount = await Image.update({ _id: ctx.request.body.id, user_id: requser.name },
    { picked: (ctx.request.body.makePick === 'true') }).exec();
  if (!imgcount) {
    return printError('that isn\'t your image', ctx);
  }
  ctx.body = { status: 'success' };
}

function getHide (ctx) {
  ctx.render('hide');
}

async function postHide (ctx) {
  var requser = (ctx.req.user || ctx.request.user);
  var imgcount = await Image.update({ _id: ctx.request.body.id, user_id: requser.name }, { hidden: (ctx.request.body.makeHide === 'true') }).exec();
  if (!imgcount) {
    return printError('that isn\'t your image', ctx);
  }
  if (ctx.request.body.makeHide === 'true') {
    ctx.redirect('/hide');
  } else {
    ctx.redirect('/' + requser.name + '/photo/' + ctx.request.body.id);
  }
}

async function makedelete (ctx) {
  var requser = (ctx.req.user || ctx.request.user);
  await Image.remove({ _id: ctx.request.body.id, user_id: requser.name }).exec();
  ctx.redirect('/hide');
}

// publish picked images
async function publish (ctx) {
  var requser = (ctx.req.user || ctx.request.user);
  if (ctx.request.body.makePublish === 'true') {
    // publish
    if (requser.posted) {
      return printError('you already posted', ctx);
    }
    var count = await Image.count({ user_id: requser.name, picked: true, hidden: false }).exec();
    if (!count) {
      return printError('you have no picked images', ctx);
    }
    if (count > 8) {
      return printError('you have too many picked images', ctx);
    }
    await User.update({ name: requser.name }, { posted: (new Date()) }).exec();
    requser.posted = new Date();
    await Image.update({ user_id: requser.name, picked: true, hidden: false }, { published: true }, { multi: true });
    ctx.body = { status: 'success' };
  } else {
    // un-publish within 60 minutes
    if (!requser.posted) {
      return printError('you have not posted', ctx);
    }
    if ((new Date()) - requser.posted > 60 * 60 * 1000) {
      return printError('too much time has passed. you can remove images but not re-publish', ctx);
    }
    await User.update({ name: requser.name }, { posted: null }).exec();
    requser.posted = null;
    await Image.update({ user_id: requser.name }, { published: false }, { multi: true });
    ctx.body = { status: 'success' };
  }
}

// comment on photo
async function comment (ctx) {
  var requser = (ctx.req.user || ctx.request.user);
  var img = await Image.findById(ctx.request.body.id).exec();
  if (!img || img.hidden || !img.published) {
    return printNoExist(err, ctx);
  }
  var user = await User.findOne({ name: img.user_id }).exec();
  if (!user) {
    return printNoExist(err, ctx);
  }
  var userFollowsSource = await following(requser, user, ctx);
  var sourceFollowsUser = await following(user, requser, ctx);
  if ((requser.name === user.name) || userFollowsSource || sourceFollowsUser) {
    if (!img.comments) {
      img.comments = [];
    }
    img.comments.push({ user: requser.name, text: ctx.request.body.text.trim() });
    img = await img.save();
    ctx.redirect('/' + user.name + '/photo/' + ctx.request.body.id);
  } else {
    return printError('you can\'t comment', ctx);
  }
}

app.use(router.routes())
  .use(router.allowedMethods());

app.listen(process.env.PORT || 8080);

module.exports = app;
