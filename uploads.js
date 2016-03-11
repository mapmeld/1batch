const middleware = require('./login.js').middleware;
const commonResponses = require('./common');
const Image = require('./models/image.js');

module.exports = function (app, router) {

  var upload;
  if (process.env.S3_BUCKET && process.env.AWS_SECRET_KEY && process.env.AWS_ACCESS_KEY) {
/*
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
*/
  } else if (process.env.CLOUDINARY_URL || (process.env.CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) {
    const cloudinary = require('cloudinary');
    const asyncBusboy = require('async-busboy')

    if (!process.env.CLOUDINARY_URL) {
      cloudinary.config({
        cloud_name: process.env.CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
      });
    }

    router.post('/upload', async function (ctx, next) {
      var requser = (ctx.req.user || ctx.request.user);
      if (!requser) {
        return ctx.redirect('/login');
      }

      var {files, fields} = await asyncBusboy(ctx.req);
      if (files.length !== 1) {
        return ctx.redirect('/profile');
      }
      var file = files[0];
      await cloudinary.uploader.upload(file.path, async function(result) {
        var i = new Image({
          test: false,
          user_id: requser.name,
          src: result.public_id,
          published: false,
          picked: false,
          hidden: false
        });
        i = await i.save();
        return i;
      }, { public_id: Math.random() + "_" + (new Date() * 1) } );
      ctx.redirect('/profile');
    });
  }
};
