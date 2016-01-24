const fs = require('fs');

var middleware = require('./login.js').middleware;
var commonResponses = require('./commonResponses');
const Image = require('./models/image.js');

module.exports = function (app, csrfProtection) {

  var upload;
  if (process.env.S3_BUCKET && process.env.AWS_SECRET_KEY && process.env.AWS_ACCESS_KEY) {
    const multer = require('multer');
    const ms3 = require('multer-s3');

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
  } else if (process.env.CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    const cloudinary = require('cloudinary');
    const busboy = require('connect-busboy');
    app.use(busboy());

    cloudinary.config({
      cloud_name: process.env.CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });

    app.post('/upload', csrfProtection, middleware, function (req, res) {
      if (!req.user) {
        return res.redirect('/login');
      }
      req.pipe(req.busboy);
      req.busboy.on('file', function (fieldname, file, filename) {
        var stream = cloudinary.uploader.upload_stream(function(result) {
          var i = new Image();
          i.test = false;
          i.user_id = req.user.name;
          i.src = result.public_id;
          i.published = false;
          i.picked = false;
          i.save(function(err) {
            if (err) {
              return commonResponses.error(err, res);
            }
            res.redirect('/profile');
          });
        }, { public_id: Math.random() + "_" + (new Date() * 1) } );
        file.pipe(stream);
      });
    });
  }
};
