var multer = require('multer');
var ms3 = require('multer-s3');

var middleware = require('./login.js').middleware;
const Image = require('./models/image.js');

module.exports = function (app, csrfProtection) {

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
};
