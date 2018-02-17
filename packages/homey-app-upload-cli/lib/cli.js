const fs         = require('fs');
const path       = require('path');
const { docopt } = require('docopt');
const ospath     = require('ospath');
const Uploader   = require('./uploader');

// Read docopt file.
let docoptFile = fs.readFileSync(path.join(__dirname, 'docopt.txt'), 'utf8');

// Try to retrieve Homey settings.
try {
  let settings = require(path.join(ospath.data(), 'com.athom.athom-cli', 'settings.json'));
  let homeyUrl = settings.homey.localUrl.replace(/:\d+$/, '');
  docoptFile = docoptFile.replace('{{ homeyUrl }}', `[default: ${ homeyUrl }]`);
} catch(e) {
  docoptFile = docoptFile.replace('{{ homeyUrl }}', '');
}

// Parse command line options.
let opts = docopt(docoptFile, { version : require('../package').version });

module.exports = async () => {
  return new Uploader(opts);
}
