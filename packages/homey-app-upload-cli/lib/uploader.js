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
    // Check if we should perform an incremental update.
    let inc     = this.opts['--incremental'];
    let mtime   = null;
    let entries = [ process.cwd() ];
    if (inc) {
      // Create incremental metadata file if it doesn't already exist.
      if (! fs.existsSync(inc)) {
        this.writeIncrementalMetadata(inc, 0);
      }

      // Grab mtime.
      mtime = fs.statSync(inc).mtimeMs;

      // Find files that have changed since last upload, taking into account
      // files that should be ignored.
      entries = walk.sync({
        path         : process.cwd(),
        ignoreFiles  : [ '.gitignore', '.homeyignore' ],
        includeEmpty : false,
        follow       : true
      }).filter(entry => {
        let stat = fs.statSync(entry);
        return stat.isFile() && stat.mtimeMs > mtime;
      });

      // Update mtime for the next time.
      this.writeIncrementalMetadata(inc);
    }

    // Anything to do?
    if (! entries.length) {
      return this.log('no changes since last update');
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
    tar.pack(process.cwd(), { entries }).on('error', err => {
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

