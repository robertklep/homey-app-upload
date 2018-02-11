const fs         = require('fs');
const path       = require('path');
const { docopt } = require('docopt');
const Uploader   = require('./uploader');

// Parse command line options.
let opts = docopt(fs.readFileSync(path.join(__dirname, 'docopt.txt'), 'utf8'), {
  version : require('../package').version
});

module.exports = async () => {
  return new Uploader(opts);
}
