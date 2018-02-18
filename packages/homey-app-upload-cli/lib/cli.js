const fs         = require('fs');
const path       = require('path');
const { docopt } = require('docopt');
const ospath     = require('ospath');
const Uploader   = require('./uploader');

// Read docopt file.
let docoptFile = fs.readFileSync(path.join(__dirname, 'docopt.txt'), 'utf8');

// Try to retrieve Homey settings.
let homeyUrl = '';
try {
  let settings = require(path.join(ospath.data(), 'com.athom.athom-cli', 'settings.json'));
  homeyUrl = `[default: ${ settings.homey.localUrl.replace(/:\d+$/, ':5481') }]`;
} catch(e) {
}
docoptFile = docoptFile.replace('{{ homeyUrl }}', homeyUrl);

// Default location for incremental metadata file.
docoptFile = docoptFile.replace('{{ incFile }}', path.join(ospath.home(), '.homey-app-upload-inc'));

// Parse command line options.
let opts = docopt(docoptFile, { version : require('../package').version });

module.exports = async () => {
  return new Uploader(opts);
}
