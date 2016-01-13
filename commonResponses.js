module.exports = {
  error: function (err, res) {
    res.json({ status: 'error', error: err });
  },
  noExist: function (res) {
    res.json({ status: 'missing', error: 'can\'t find that user or image' });
  }
};
