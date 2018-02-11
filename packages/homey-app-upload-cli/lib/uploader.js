const url      = require('url');
const fs       = require('fs');
const http     = require('http');
const chokidar = require('chokidar');
const path     = require('path');
const { pack } = require('tar-pack');

module.exports = class Uploader {

  constructor(opts) {
    this.opts  = Object.assign({}, opts);
    this.log   = console.log.bind(console, '[homey-app-upload]');
    this.debug = this.opts['--verbose'] ? this.log : () => {};

    // Parse server url.
    let { hostname, port } = url.parse(this.opts['--url'] || process.env['HOMEY_APP_UPLOAD_URL'] || '');
    port = port || 5481;
    if (! hostname || ! port) {
      return Error('invalid server URL');
    }
    this.opts.hostname = hostname;
    this.opts.port     = port;

    // Start watcher?
    if (this.opts['watch']) {
      this.watch();
    }

    // Upload?
    if (this.opts['upload']) {
      this.upload();
    }

  }

  watch() {
    let file = this.opts['<file>'];

    // Make sure watch file exists.
    fs.writeFileSync(file, '');

    // Start watching.
    let first = true;
    this.debug('starting watcher on', file);
    chokidar.watch(file).on('change', (path, stats) => {
      if (first) { first = false; return }
      this.debug('watcher file changed');
      this.upload();
    });
  }

  upload() {
    // Track the number of changed files (for incremental updates; if no changes
    // were found, we don't restart the app).
    let numChanges = 0;

    // Connect to HTTP server.
    let req = http.request({
      method   : 'post',
      path     : '/app-upload',
      hostname : this.opts.hostname,
      port     : this.opts.port,
    }, res => {
      res.on('data', () => {}).on('end', () => {
        this.log(`upload completed (${ numChanges } files uploaded), status:`, res.statusCode === 200 ? 'OK' : 'FAILED');
        if (res.statusCode === 200 && ! this.opts['--no-restart'] && numChanges) {
          this.restart();
        }
      });
    }).on('error', err => {
      this.log('HTTP request error', err)
    });

    // Check if we should perform an incremental update.
    let inc   = this.opts['--incremental'];
    let mtime = null;
    if (inc) {
      // Create incremental metadata file if it doesn't already exist.
      if (! fs.existsSync(inc)) {
        this.writeIncrementalMetadata(inc, 0);
      }

      // Grab mtime.
      mtime = fs.statSync(inc).mtimeMs;

      // Update mtime for the next time.
      this.writeIncrementalMetadata(inc);
    }

    // Create TAR stream and pipe it to the HTTP request.
    pack(process.cwd(), {
      fromBase      : true,
      noProprietary : true,
      ignoreFiles   : [ '.gitignore', '.homeyignore' ],
      filter        : entry => {
        let rel = path.relative(process.cwd(), entry.path);

        // Don't upload `env.json`
        if (entry.basename === 'env.json') return false;

        // Don't upload incremental update metadata file.
        if (entry.basename === inc) return false;

        // If `mtime` is set, this is an incremental update, in which
        // case we only select files that have been modified since then.
        if (mtime !== null) {
          let entryMtime = fs.statSync(entry.path).mtimeMs;
          let hasChanged = entryMtime > mtime;
          if (hasChanged) {
            this.debug('uploading:', rel);
            numChanges++;
          }
          return hasChanged;
        }
        this.debug('uploading:', rel);

        // Accept file.
        numChanges++;
        return true;
      }
    }).pipe(req);
  }

  restart() {
    http.request({
      path     : '/restart',
      hostname : this.opts.hostname,
      port     : this.opts.port
    }).on('data', () => {}).on('error', () => {}).end();
  }

  writeIncrementalMetadata(path, timestamp) {
    // Write (empty) file.
    fs.writeFileSync(path, '');

    // Update file times.
    if (isNaN(timestamp)) {
      timestamp = Date.now() / 1000;
    }
    fs.utimesSync(path, timestamp, timestamp);
  }
}

