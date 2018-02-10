const fs         = require('fs');
const path       = require('path');
const url        = require('url');
const http       = require('http');
const { pack }   = require('tar-pack');
const { docopt } = require('docopt');

// Parse command line options.
let opts = docopt(fs.readFileSync(path.join(__dirname, 'docopt.txt'), 'utf8'), {
  version : require('../package').version
});

module.exports = async () => {
  let log                = console.log.bind(console, '[homey-app-upload]');
  let { hostname, port } = url.parse(process.env['HOMEY_APP_UPLOAD_SERVER'] || '');
  hostname = opts['--host'] || hostname;
  port     = opts['--port'] || port;

  if (! hostname || ! port) {
    return log('invalid hostname and/or port');
  }

  // Track the number of changed files (for incremental updates; if no changes
  // were found, we don't restart the app).
  let numChanges = 0;

  // Connect to HTTP server.
  let req = http.request({
    method : 'post',
    path   : '/app-upload',
    hostname,
    port,
  }, res => {
    res.on('data', () => {}).on('end', () => {
      log('upload completed, status:', res.statusCode === 200 ? 'OK' : 'FAILED');
      if (res.statusCode === 200 && ! opts['--no-restart'] && numChanges) {
        http.request({ path : '/restart', hostname, port })
            .on('error', () => {})
            .end();
      }
    });
  }).on('error', err => {
    log('HTTP request error', err)
  });

  // Check if we should perform an incremental update.
  let inc   = opts['--incremental'];
  let mtime = null;
  if (inc) {
    // Create incremental metadata file if it doesn't already exist.
    if (! fs.existsSync(inc)) {
      writeIncrementalMetadata(inc, 0);
    }

    // Grab mtime.
    mtime = fs.statSync(inc).mtimeMs;

    // Update mtime for the next time.
    writeIncrementalMetadata(inc);
  }

  // Create TAR stream and pipe it to the HTTP request.
  pack(process.cwd(), {
    fromBase      : true,
    noProprietary : true,
    ignoreFiles   : [ '.gitignore', '.homeyignore' ],
    filter        : entry => {
      // Don't upload `env.json`
      if (entry.basename === 'env.json') return false;

      // Don't upload incremental update metadata file.
      if (entry.basename === inc) return false;

      // If `mtime` is set, this is an incremental update, in which
      // case we only select files that have been modified since then.
      if (mtime !== null) {
        let entryMtime = fs.statSync(entry.path).mtimeMs;
        let hasChanged = entryMtime > mtime;
        if (hasChanged) numChanges++;
        return hasChanged;
      }

      // Accept file.
      numChanges++;
      return true;
    }
  }).pipe(req);
};

function writeIncrementalMetadata(path, timestamp) {
  // Write (empty) file.
  fs.writeFileSync(path, '');

  // Update file times.
  if (isNaN(timestamp)) {
    timestamp = Date.now() / 1000;
  }
  fs.utimesSync(path, timestamp, timestamp);
}
