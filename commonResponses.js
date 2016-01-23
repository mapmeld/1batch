const cloudinary = require('cloudinary');

module.exports = {
  error: function (err, res) {
    res.json({ status: 'error', error: err });
  },
  noExist: function (res) {
    res.json({ status: 'missing', error: 'can\'t find that user or image' });
  },
  responsiveImg: function (imgsrc, isBig) {
    var baseSize = 300;
    if (isBig) {
      baseSize *= 2;
    }
    return {
      mini: cloudinary.url(imgsrc, { format: "jpg", width: baseSize * 2/3, height: baseSize * 2/3, crop: "fill" }),
      main: cloudinary.url(imgsrc, { format: "jpg", width: baseSize, height: baseSize, crop: "fill" }),
      retina: cloudinary.url(imgsrc, { format: "jpg", width: baseSize * 2, height: baseSize * 2, crop: "fill" })
    };
  }
};
