const cloudinary = require('cloudinary');
const Follow = require('./models/following.js');

// respond with error
function error(err, res) {
  res.json({ status: 'error', error: err });
}

// respond that the resource does not exist
function noExist(res) {
  res.json({ status: 'missing', error: 'can\'t find that user or image' });
}

// break an image into multiple sizes
function responsiveImg(img, isBig) {
  var baseSize = 300;
  if (isBig) {
    baseSize *= 2;
  }
  var out = {
    _id: img._id,
    picked: img.picked,
    published: img.published,
    hidden: img.hidden,
    src: {
      mini: cloudinary.url(img.src, { format: "jpg", width: baseSize * 2/3, height: baseSize * 2/3, crop: "fill" }),
      main: cloudinary.url(img.src, { format: "jpg", width: baseSize, height: baseSize, crop: "fill" }),
      retina: cloudinary.url(img.src, { format: "jpg", width: baseSize * 2, height: baseSize * 2, crop: "fill" })
    }
  };
  return out;
}

// multiple outcomes for follow-check
function following(fromUser, toUser, res, callback) {
  if (fromUser) {
    Follow.findOne({ start_user_id: fromUser.name, end_user_id: toUser.name }, function (err, f) {
      if (err) {
        // error occurred
        return error(err, res);
      }
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

module.exports = {
  error: error,
  noExist: noExist,
  responsiveImg: responsiveImg,
  following: following
};
