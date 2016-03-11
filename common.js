const cloudinary = require('cloudinary');
const Follow = require('./models/following.js');
const ago = require('time-ago')().ago;

// respond with error
function error(err, res) {
  res.body = { status: 'error', error: err };
}

// respond that the resource does not exist
function noExist(res) {
  res.body = { status: 'missing', error: 'can\'t find that user or image' };
}

// break an image into multiple sizes
function responsiveImg(img, isBig) {
  var baseSize = 300;
  var geturl = cloudinary.url;
  if (!process.env.CLOUDINARY_URL && !process.env.CLOUD_NAME && !process.env.CLOUDINARY_API_KEY && !process.env.CLOUDINARY_API_SECRET) {
    // test instance
    geturl = function(url) {
      return url;
    }
  }
  if (isBig) {
    baseSize *= 2;
  }
  var out = {
    _id: img._id,
    picked: img.picked,
    published: img.published,
    hidden: img.hidden,
    src: {
      mini: geturl(img.src, { format: "jpg", width: baseSize * 2/3, height: baseSize * 2/3, crop: "fill" }).replace('http:', ''),
      main: geturl(img.src, { format: "jpg", width: baseSize, height: baseSize, crop: "fill" }).replace('http:', ''),
      retina: geturl(img.src, { format: "jpg", width: baseSize * 2, height: baseSize * 2, crop: "fill" }).replace('http:', '')
    }
  };
  return out;
}

// multiple outcomes for follow-check
function following(fromUser, toUser, res, callback) {
  if (fromUser && toUser) {
    Follow.findOne({ start_user_id: fromUser.name, end_user_id: toUser.name }).exec(function (err, f) {
      if (f) {
        if (f.blocked) {
          // block exists: show no user or image
          noExist(res);
        } else {
          // positive follow exists, continue
          callback(true);
        }
      } else {
        // no follow exists, continue
        callback(false);
      }
    });
  } else {
    // not logged in, continue
    callback(false);
  }
}

function cleanDate(d) {
  if (d) {
    return ago(d);
  }
  return d;
}

module.exports = {
  error: error,
  noExist: noExist,
  responsiveImg: responsiveImg,
  following: following,
  cleanDate: cleanDate
};
