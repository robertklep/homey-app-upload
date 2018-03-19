const url             = require('url');
const fs              = require('fs');
const http            = require('http');
const chokidar        = require('chokidar');
const { createGzip }  = require('zlib');
const tar             = require('tar-fs');
const walk            = require('ignore-walk');

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
    return console.error('not implemented yet');

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
    let isDryRun    = this.opts['--dry-run'];
    let incremental = this.opts['--incremental'];
    let incFile     = this.opts['--incremental-file'];
    let mtime       = 0;

    // Create incremental metadata file if it doesn't already exist,
    // and grab its last-modified time.
    if (incremental) {
      if (! fs.existsSync(incFile)) {
        this.writeIncrementalMetadata(incFile, 0);
      }
      mtime = fs.statSync(incFile).mtimeMs;
    }

    // Find files to upload.
    let entries = walk.sync({
      path         : process.cwd(),
      ignoreFiles  : [ '.gitignore', '.homeyignore' ],
      includeEmpty : false,
      follow       : true
    }).filter(entry => {
      // Shortcut.
      if (! incremental) return true;

      // For incremental updates, we compare the last-modified time
      // to the one of the incremental metadata file.
      let stat       = fs.statSync(entry);
      let hasChanged = stat.isFile() && stat.mtimeMs > mtime;

      // Changed to `app.json` require a full re-upload using the `athom-cli` tool.
      if (hasChanged && entry.endsWith('app.json')) {
        console.error(`
NOTICE: 'app.json' has changed, which will require
        a full re-upload using 'athom app run' for
        all changes to be applied.

        If a device's capabilities have changed,
        you may also need to re-pair the device.

`);
      }
      return hasChanged;
    });

    // Update mtime for the next time (unless this is a dry run).
    if (incremental && ! isDryRun) {
      this.writeIncrementalMetadata(incFile);
    }

    // Anything to do?
    if (! entries.length) {
      return this.log('no changes since last update');
    }

    // Dry run?
    if (isDryRun) {
      return console.log(entries.join('\n'));
    }
    this.debug('uploading:', entries);

    // Connect to HTTP server.
    let req = http.request({
      method   : 'post',
      path     : '/app-upload',
      hostname : this.opts.hostname,
      port     : this.opts.port,
    }, res => {
      res.on('data', () => {}).on('end', () => {
        this.log(`upload completed (${ entries.length } files uploaded), status:`, res.statusCode === 200 ? 'OK' : 'FAILED');
        if (res.statusCode === 200 && ! this.opts['--no-restart']) {
          this.restart();
        }
      });
    }).on('error', err => {
      this.log('HTTP request error', err)
    });

    // Create TAR stream and pipe it to the HTTP request.
    tar.pack(process.cwd(), { entries : Object.assign([], entries) }).on('error', err => {
      this.log('tar error', err);
    }).pipe(createGzip({ level : 9 })).pipe(req);
  }

  restart() {
    http.request({
      path     : '/restart',
      hostname : this.opts.hostname,
      port     : this.opts.port
    }).on('data', () => {}).on('error', () => {}).end();
  }

  writeIncrementalMetadata(path, timestamp) {
    // Write (empty) file if it doesn't already exist.
    if (! fs.existsSync(path)) {
      fs.writeFileSync(path, '');
    }

    // Update file times.
    if (isNaN(timestamp)) {
      timestamp = Date.now() / 1000;
    }
    fs.utimesSync(path, timestamp, timestamp);
  }
}

