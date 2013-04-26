var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var res = mod._cached ? mod._cached : mod();
    return res;
}

require.paths = [];
require.modules = {};
require.extensions = [".js",".coffee"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = x + '/package.json';
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

require.define = function (filename, fn) {
    var dirname = require._core[filename]
        ? ''
        : require.modules.path().dirname(filename)
    ;
    
    var require_ = function (file) {
        return require(file, dirname)
    };
    require_.resolve = function (name) {
        return require.resolve(name, dirname);
    };
    require_.modules = require.modules;
    require_.define = require.define;
    var module_ = { exports : {} };
    
    require.modules[filename] = function () {
        require.modules[filename]._cached = module_.exports;
        fn.call(
            module_.exports,
            require_,
            module_,
            module_.exports,
            dirname,
            filename
        );
        require.modules[filename]._cached = module_.exports;
        return module_.exports;
    };
};

if (typeof process === 'undefined') process = {};

if (!process.nextTick) process.nextTick = (function () {
    var queue = [];
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;
    
    if (canPost) {
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);
    }
    
    return function (fn) {
        if (canPost) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        }
        else setTimeout(fn, 0);
    };
})();

if (!process.title) process.title = 'browser';

if (!process.binding) process.binding = function (name) {
    if (name === 'evals') return require('vm')
    else throw new Error('No such module')
};

if (!process.cwd) process.cwd = function () { return '.' };

if (!process.env) process.env = {};
if (!process.argv) process.argv = [];

require.define("path", function (require, module, exports, __dirname, __filename) {
function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"index.js"}
});

require.define("/index.js", function (require, module, exports, __dirname, __filename) {
var EventEmitter = require('events').EventEmitter;

module.exports = function (slides) {
    return new Swoop(slides || {});
};

function Swoop (slides) {
    var self = this;
    self.slides = {};
    self.history = [];
    self.element = document.createElement('div');
    
    Object.keys(slides).forEach(function (name) {
        self.addSlide(name, slides[name]);
    });
}

Swoop.prototype = new EventEmitter;

Swoop.prototype.addSlide = function (name, element) {
    var self = this;
    self.slides[name] = element;
    css(element, 'display', 'none');
    self.element.appendChild(element);
    
    var links = element.querySelectorAll('.link');
    
    for (var i = 0; i < links.length; i++) {
        (function (link) {
            link.addEventListener('click', function (ev) {
                if (ev && typeof ev.preventDefault === 'function') {
                    ev.preventDefault();
                }
                var name = link.getAttribute('href').replace(/^#/, '');
                if (name === '_back') {
                    self.back();
                }
                else self.show(name)
            });
        })(links[i]);
    }
};

Swoop.prototype.show = function (name) {
    var self = this;
    var slide = self.slides[name];
    if (!slide) return undefined;
    
    var useDefault = true;
    slide.preventDefault = function () { useDefault = false };
    
    this.emit('show', slide, self.active);
    
    if (useDefault) {
        css(slide, 'display', 'block');
        if (self.active) css(self.active, 'display', 'none');
    }
    self.active = slide;
    self.history.push(name);
    
    return slide;
};

Swoop.prototype.back = function () {
    var self = this;
console.dir(self.history);
    self.history.pop(); // present slide
    var name = self.history.pop(); // previous slide
console.log('back: ' + name);
    return self.show(name);
};

Swoop.prototype.appendTo = function (e) {
    e.appendChild(this.element);
};

Swoop.prototype.size = function (w, h) {
    css(this.element, 'width', w);
    css(this.element, 'height', h);
};

function css (elem, name, value) {
    if (!elem.style) elem.style = {};
    elem.style[name] = value;
}

});

require.define("events", function (require, module, exports, __dirname, __filename) {
if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = list.indexOf(listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

});

require.define("/node_modules/domready/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"./ready.js"}
});

require.define("/node_modules/domready/ready.js", function (require, module, exports, __dirname, __filename) {
/*!
  * domready (c) Dustin Diaz 2012 - License MIT
  */
!function (name, definition) {
  if (typeof module != 'undefined') module.exports = definition()
  else if (typeof define == 'function' && typeof define.amd == 'object') define(definition)
  else this[name] = definition()
}('domready', function (ready) {

  var fns = [], fn, f = false
    , doc = document
    , testEl = doc.documentElement
    , hack = testEl.doScroll
    , domContentLoaded = 'DOMContentLoaded'
    , addEventListener = 'addEventListener'
    , onreadystatechange = 'onreadystatechange'
    , readyState = 'readyState'
    , loaded = /^loade|c/.test(doc[readyState])

  function flush(f) {
    loaded = 1
    while (f = fns.shift()) f()
  }

  doc[addEventListener] && doc[addEventListener](domContentLoaded, fn = function () {
    doc.removeEventListener(domContentLoaded, fn, f)
    flush()
  }, f)


  hack && doc.attachEvent(onreadystatechange, fn = function () {
    if (/^c/.test(doc[readyState])) {
      doc.detachEvent(onreadystatechange, fn)
      flush()
    }
  })

  return (ready = hack ?
    function (fn) {
      self != top ?
        loaded ? fn() : fns.push(fn) :
        function () {
          try {
            testEl.doScroll('left')
          } catch (e) {
            return setTimeout(function() { ready(fn) }, 50)
          }
          fn()
        }()
    } :
    function (fn) {
      loaded ? fn() : fns.push(fn)
    })
})
});

require.define("/example/yarn.js", function (require, module, exports, __dirname, __filename) {
module.exports = require("yarnify")("_ed033123-",{"/foo.html":"<h1>foo</h1>\n\n<div>bleep bloop</div>\n\n<div>\n  <a class=\"link\" href=\"#bar\">go to this place</a>\n</div>\n\n<div>\n  <a class=\"link\" href=\"#beep\">or go here instead</a>\n</div>\n","/beep.html":"<h1>beep</h1>\n\n<h2>ROBOTS?</h2>\n\n<div>[\n  <a class=\"link\" href=\"#boop\">Y</a>\n  /\n  <a class=\"link\" href=\"#end\">N</a>\n]</div>\n","/end.html":"<h1>__END__</h1>\n\n<a class=\"link\" href=\"#foo\">restart</a>\n","/boop.html":"<h1>boop</h1>\n\n<div>\n  <img src=\"http://substack.net/images/robot.png\">\n</div>\n\n<div>\n  <a class=\"link\" href=\"#end\">Very good. Now do the last thing.</a>\n</div>\n","/bar.html":"<h1>bar</h1>\n\n<div>\n  here are some things\n</div>\n\n<div>\n  <a class=\"link\" href=\"#baz\">so there's the next thing</a>\n</div>\n\n<div>\n  <a class=\"link\" href=\"#_back\">go back</a>\n</div>\n","/baz.html":"<h1>baz</h1>\n\n<div>\n  Oh hey.\n</div>\n\n<div>\n  <a class=\"link\" href=\"#end\">go to the last thing</a>\n</div>\n\n<div>\n  <a class=\"link\" href=\"#_back\">go back</a>\n</div>\n"});

});

require.define("/node_modules/yarnify/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"index.js","browserify":"browser.js"}
});

require.define("/node_modules/yarnify/browser.js", function (require, module, exports, __dirname, __filename) {
var path = require('path');
var parse = require('./browser/parse');
var withPrefix = require('./browser/with_prefix');

module.exports = function (prefix, files) {
    var cssFiles = [];
    var elems = {};
    Object.keys(files).forEach(function (file) {
        if (/\.css$/i.test(file)) {
            cssFiles.push(files[file]); 
        }
        else {
            elems[file] = parse(prefix, files[file]);
        }
    });
    var css = document.createElement('style');
    var cssText = document.createTextNode(cssFiles.join('\n'));
    css.appendChild(cssText);
    var insertedCss = false;
    
    var y = function (file_, opts) {
        if (!opts) opts = {};
        var file = path.resolve('/', file_);
        var elem = withPrefix(prefix, elems[file].cloneNode(true));
        
        if (opts.css !== false && !insertedCss) {
            document.head.appendChild(css);
            insertedCss = true;
        }
        return elem;
    };
    
    y.parse = function (src) {
        return parse(prefix, src);
    };
    
    y.files = Object.keys(files);
    
    return y;
};

});

require.define("/node_modules/yarnify/browser/parse.js", function (require, module, exports, __dirname, __filename) {
module.exports = function (prefix, src) {
    var elem = document.createElement('div');
    var className = prefix.slice(0, -1);
    elem.setAttribute('class', prefix + '_container');
    elem.innerHTML = src;
    
    var nodes = elem.querySelectorAll('*');
    
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var c = node.getAttribute('class');
        if (c) {
            node.setAttribute('class', c.split(/\s+/)
                .map(function (x) { return  prefix + x })
                .concat(className)
                .join(' ')
            );
        }
        else {
            node.setAttribute('class', className);
        }
        
        var id = node.getAttribute('id');
        if (id) node.setAttribute('id', prefix + id);
    }
    
    return elem;
};

});

require.define("/node_modules/yarnify/browser/with_prefix.js", function (require, module, exports, __dirname, __filename) {
module.exports = function (prefix, elem) {
    elem.pre = prefix;
    
    elem.getElementById = function (id) {
        return document.getElementById(prefix + id);
    };
    
    elem.getElementsByClassName = function (name) {
        return document.getElementsByClassName(prefix + name);
    };
    
    var querySelector = elem.querySelector;
    elem.querySelector = function (sel) {
        var s = sel.replace(/([.#])([^.\s])/g, function (_, op, c) {
            return op + prefix + c;
        });
        return querySelector.call(this, s);
    };
    
    var querySelectorAll = elem.querySelectorAll;
    elem.querySelectorAll = function (sel) {
        var s = sel.replace(/([.#])([^.\s])/g, function (_, op, c) {
            return op + prefix + c;
        });
        return querySelectorAll.call(this, s);
    };
    
    return elem;
};

});

require.define("/example/entry.js", function (require, module, exports, __dirname, __filename) {
    var swoop = require('../');
var domready = require('domready');
var yarn = require('./yarn');

domready(function () {
    var sw = swoop({
        foo : yarn('foo.html'),
        bar : yarn('bar.html'),
        baz : yarn('baz.html'),
        beep : yarn('beep.html'),
        boop : yarn('boop.html'),
        end : yarn('end.html')
    });
    sw.size(800, 600);
    sw.appendTo(document.body);
    sw.show('foo');
});

});
require("/example/entry.js");
