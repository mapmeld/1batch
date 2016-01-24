const cloudinary = require('cloudinary');

module.exports = {
  error: function (err, res) {
    res.json({ status: 'error', error: err });
  },
  noExist: function (res) {
    res.json({ status: 'missing', error: 'can\'t find that user or image' });
  },
  responsiveImg: function (img, isBig) {
    var baseSize = 300;
    if (isBig) {
      baseSize *= 2;
    }
    var out = {
      _id: img._id,
      src: {
        mini: cloudinary.url(img.src, { format: "jpg", width: baseSize * 2/3, height: baseSize * 2/3, crop: "fill" }),
        main: cloudinary.url(img.src, { format: "jpg", width: baseSize, height: baseSize, crop: "fill" }),
        retina: cloudinary.url(img.src, { format: "jpg", width: baseSize * 2, height: baseSize * 2, crop: "fill" })
      }
    };
    return out;
  }
};
