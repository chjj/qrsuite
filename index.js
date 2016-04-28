/*!
 * QR codes
 * Copyright (c) 2014-2016, Christopher Jeffrey (MIT License).
 */

var url = require('url');
var querystring = require('querystring');
var fs, cp;

var isBrowser =
  (typeof process !== 'undefined' && process.browser)
  || typeof window !== 'undefined';

try {
  fs = require('f' + 's');
  cp = require('child_' + 'process');
} catch (e) {
  ;
}

exports.scanning = false;

/*!
 * Rewritten version of: https://github.com/dwa012/html5-qrcode
 * Copyright (c) 2013 Daniel Ward (MIT License)
 */

exports.scanBrowser = function scanBrowser(callback) {
  var div, height, width, video, canvas;
  var context, URL, getUserMedia, mediaStream, called;
  var jsqrcode = require('./jsqrcode');

  if (exports.scanning)
    return callback(new Error('Already scanning.'));

  exports.scanning = true;

  height = 250;
  width = 300;

  div = create('<div'
    + ' style="'
    + ' width:' + width + 'px;height:' + height + 'px;'
    + ' position:absolute;left:50%;top:50%;'
    + ' margin-left:-150px;margin-top:-125px;'
    + '">'
    + '</div>');

  video = create('<video'
    + ' width="' + width + '"'
    + ' height="' + height + '"'
    + '>'
    + '</video>');

  canvas = create('<canvas'
    + ' id="qr-canvas"'
    + ' width="' + (width - 2) + '"'
    + ' height="' + (height - 2) + '"'
    + ' style="display:none">'
    + '</canvas>');

  document.body.appendChild(div);
  div.appendChild(video);
  div.appendChild(canvas);

  context = canvas.getContext('2d');

  URL = window.URL
    || window.webkitURL
    || window.mozURL
    || window.msURL;

  getUserMedia = navigator.getUserMedia
    || navigator.webkitGetUserMedia
    || navigator.mozGetUserMedia
    || navigator.msGetUserMedia;

  function done(err, result) {
    document.body.removeChild(div);

    if (called)
      return;

    called = true;

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    if (mediaStream) {
      mediaStream.getVideoTracks().forEach(function(videoTrack) {
        videoTrack.stop();
      });
    }

    exports.scanning = false;
    callback(err, result);
  }

  if (!getUserMedia) {
    return done(
      new Error('Webcam streaming not supported by browser.'));
  }

  getUserMedia.call(navigator, { video: true, audio: false }, function(stream) {
    var url;

    if (called)
      return;

    url = (URL && URL.createObjectURL(stream)) || stream;

    if (navigator.mozGetUserMedia)
      video.mozSrcObject = url;
    else
      video.src = url;

    video.play();

    mediaStream = stream;

    timer = setInterval(function() {
      var result;

      context.drawImage(video, 0, 0, width + 7, height);

      try {
        result = jsqrcode.decode();
      } catch (e) {
        if (typeof e === 'string')
          e = new Error(e);
        console.error(e.message);
        return;
      }

      done(null, result);
    }, 500);
  }, function(err) {
    done(err);
  });

  return done;
};

exports.encodeBrowser = function encodeBrowser(code, callback) {
  var qrjs = require('./qr');
  var canvas, context, qrcode, cells, tileW, tileH;
  var r, row, c, w, h, uri, data;

  canvas = create('<canvas width="200" height="200"></canvas>');
  context = canvas.getContext('2d');
  qrcode = qrjs(code);
  cells = qrcode.modules;
  tileW = 200 / cells.length;
  tileH = 200 / cells.length;

  for (r = 0; r < cells.length; r++) {
    row = cells[r];
    for (c = 0; c < row.length; c++) {
      context.fillStyle = row[c] ? '#000' : '#fff';
      w = Math.ceil((c + 1) * tileW) - Math.floor(c * tileW);
      h = Math.ceil((r + 1) * tileH) - Math.floor(r * tileH);
      context.fillRect(Math.round(c * tileW), Math.round(r * tileH), w, h);
    }
  }

  uri = canvas.toDataURL('image/png', 1.0);
  data = uri.split(',')[1].replace(/\s+/g, '');
  data = new Buffer(decodeURIComponent(data), 'base64');

  callback(null, data);
};

exports.scanReal = function scanReal(callback) {
  var child;

  child = zbar(['-q', '--raw'], {}, function(err, result) {
    if (err) {
      if (err.message.indexOf('Exit code:') === 0) {
        child = zbar(['-q', '--raw', '/dev/video0'],
          { LD_PRELOAD: '/usr/lib/libv4l/v4l1compat.so' },
          callback);
        return;
      }
      return callback(err);
    }

    return callback(null, result);
  });

  return function stop() {
    child.kill('SIGTERM');
  };
};

exports.encodeReal = function encodeReal(code, callback) {
  var args = ['-t', 'PNG', '-o', '-', code];
  var options = { encoding: null };
  return cp.execFile('qrencode', args, options, function(err, stdout, stderr) {
    if (err)
      return errback(callback)(err);

    if (stderr) {
      stderr = stderr.toString('utf8');
      if (stderr.trim())
        return callback(new Error(stderr));
    }

    return callback(null, stdout);
  });
};

exports.encodeANSI = function encodeANSI(code, callback) {
  var args = ['-t', 'ANSI256', code];

  assert(!isBrowser, 'Only works in non-toy mode.');

  return cp.execFile('qrencode', args, function(err, stdout, stderr) {
    if (err)
      return errback(callback)(err);

    if (stderr && stderr.trim())
      return callback(new Error(stderr));

    return callback(null, stdout.trim());
  });
};

exports.createImage = function createImage(data, callback) {
  var uri = 'data:image/png;base64,'
    + encodeURIComponent(data.toString('base64'));
  return create('<img src="' + uri + '">');
};

exports.nop = function() {};

exports.displayImage = function displayImage(data, callback) {
  var img, div, child;

  if (!callback)
    callback = exports.nop;

  if (isBrowser) {
    img = exports.createImage(data);
    img.width = 200;
    img.height = 200;
    div = create('<div style="width:200px;height:200px;"'
      + 'position:absolute;margin-left:-100px;'
      + 'margin-top:-100px;"></div>');
    div.appendChild(img);
    document.body.appendChild(div);
    return function stop() {
      document.body.removeChild(div);
      callback();
    };
  }

  child = cp.spawn('feh', ['-'], { stdio: ['pipe', 'ignore', 'ignore'] });

  child.on('error', errback(callback));

  child.on('exit', function(code) {
    if (code != null && code !== 0)
      return callback(new Error('Exit code: ' + code));
    callback();
  });

  child.stdin.on('error', callback);

  child.stdin.write(data);
  child.stdin.end();

  return function stop() {
    child.kill('SIGTERM');
  };
};

exports.scan = isBrowser
  ? exports.scanBrowser
  : exports.scanReal;

exports.encode = isBrowser
  ? exports.encodeBrowser
  : exports.encodeReal;

/*
 * Helpers
 */

function create(html) {
  var el = document.createElement('div');
  el.innerHTML = html;
  return el.firstChild;
}

function errback(callback) {
  return function(err, result) {
    if (err) {
      if (err.code === 'ENOENT') {
        callback(
          new Error('Could not execute. Is `' + err.path + '` installed?'));
        return;
      }
      return callback(err);
    }
    return callback(null, result);
  };
}

function merge(target) {
  var args = Array.prototype.slice.call(arguments, 1);
  args.forEach(function(obj) {
    Object.keys(obj).forEach(function(key) {
      target[key] = obj[key];
    });
  });
  return target;
}

function zbar(args, env, callback) {
  var result = '';
  var options, child;

  options = {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
    env: merge({}, process.env, env)
  };

  child = cp.spawn('zbarcam', args, options);

  child.stdout.on('error', callback);

  child.stdout.on('data', function(data) {
    result += data;
    if (result.indexOf('\n') !== -1)
      child.kill('SIGTERM');
  });

  child.on('error', errback(callback));

  child.on('exit', function(code) {
    if (code != null && code !== 0)
      return callback(new Error('Exit code: ' + code));
    callback(null, result.split('\n')[0].trim());
  });

  return child;
}
