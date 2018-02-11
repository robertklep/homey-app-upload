# Homey App Upload

CLI tool and library to make developing apps for the [Homey home automation](http://athom.com) platform a bit easier.

The purpose is to allow for incremental app updates to be pushed to Homey during app development.

## Installation

This tool consists of two parts: a library that you need to include in your Homey app, and a CLI (command line interface) tool that you should install on the computer you are developing on.

### Library

#### Installation

```bash
$ cd path-to-your-homey-app
$ npm install homey-app-upload-lib
```

#### Usage

The library needs to be initialized from the `onInit` method of your app, and should be passed your app's manifest as an argument:

```javascript
const HomeyAppUpload = require('homey-app-upload-lib');

...

class YourHomeyApp extends Homey.App {
    onInit() {
        HomeyAppUpload(this.manifest);
        ...
    }
    ...
}
```

Remarks:
* The library requires the `homey:manager:api` permission, and will refuse to run when it isn't set.
* The library should not be used in published apps.

### CLI

#### Installation

```bash
$ npm install homey-app-upload-cli -g
```

#### Usage

```
homey-app-upload – Homey App Upload

Usage:
  homey-app-upload [options] upload
  homey-app-upload [options] watch <file>

Options:
  -h --help                Show this screen
  -v --version             Show version
  -I --incremental=<file>  Allow incremental updates, using `file` for metadata
  -U --url=<url>           Homey Uploader Server URL
  -N --no-restart          Don't restart app after changes have been uploaded
  -V --verbose             More verbose output

Instead of passing -H/--host/-P/--port, you can set an environment variable
HOMEY_APP_UPLOAD_URL that contains the URL for the upload server:

    export HOMEY_APP_UPLOAD_URL=http://192.168.1.100:5481/
```

First, run `athom project --run` to upload the app to Homey initially. Keep it running, and open another window/terminal from which to run (incremental) updates using this CLI tool.

By default, the CLI tool uploads the entire app.

##### Incremental updates

If you want incremental updates, use the `-I` option:

```
$ homey-app-upload -I .inc upload
```

The purpose of the `.inc` file is to keep track which files have changed since the last upload. When doing an incremental upload, only the changed files will be uploaded, typically reducing the upload time significantly when compared to uploading the entire app.

##### File watching

The `watch <file>` command will watch for changes of `<file>`. When that happens, the app will be uploaded (either in full, or incrementally when `-I` is used).

The rationale behind this is that you could use a "watch file" and change that file (for instance, using `touch .file`) to trigger an upload. If you somehow hook this up to your editor, you could trigger uploads whenever you're done editing a file.

##### App restarts

After uploading, the default action is to restart the app. This can be prevented using the `-N/--no-restart` option.
