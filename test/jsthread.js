"use strict";
var threading;
(function (threading) {
    var _hostedThreads = {};
    var _localeThread;
    var hostedThread = /** @class */ (function () {
        function hostedThread(name) {
            this.name = name;
            this.localeWindow = void 0;
            this.hostWindow = void 0;
            this.isExec = false;
            this.apiQuee = [];
            this.apiCallback = {};
            if (name in _hostedThreads)
                throw "the thread name is exist";
            _hostedThreads[name] = this;
        }
        hostedThread.prototype.destroy = function () {
            this.localeWindow.removeEventListener('message', this);
            this.localeWindow.removeEventListener('messageerror', this);
            delete _hostedThreads[this.name];
            this.apiQuee.length = 0;
        };
        hostedThread.prototype.initialize = function (localeWindow, hostWindow) {
            if (this.localeWindow)
                throw "is initialized";
            if (!localeWindow || !hostWindow)
                throw "arguments null";
            Object.defineProperty(this, 'localeWindow', { writable: false, configurable: false, value: localeWindow });
            Object.defineProperty(this, 'hostWindow', { writable: false, configurable: false, value: hostWindow });
            localeWindow.addEventListener('message', this);
            localeWindow.addEventListener('messageerror', this);
            this.next();
            return this;
        };
        hostedThread.prototype.newID = function () {
            var id = (hostedThread.num++).toString(36) + (Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
            if (id in this.apiCallback)
                return this.newID();
            return id;
        };
        hostedThread.prototype.sendCommand = function (api, data, timeout) {
            var _this = this;
            if (timeout === void 0) { timeout = 1500; }
            return new Promise(function (res, rej) {
                var msg = {
                    mid: _this.newID(),
                    data: data, api: api, timeout: timeout,
                };
                _this.apiCallback[msg.mid] = { res: res, rej: rej, msg: msg };
                _this.apiQuee.push(msg);
                if (!_this.isExec)
                    _this.next();
            });
        };
        hostedThread.prototype.msgCallback = function (e) {
            if (e.target !== window)
                return;
            var msgResult = e.data;
            if (!msgResult.mid)
                return;
            var cur = this.apiCallback[msgResult.mid];
            if (cur) {
                delete this.apiCallback[msgResult.mid];
                if (cur.msg && cur.msg.threadId)
                    clearTimeout(cur.msg.threadId);
                if (msgResult.succ)
                    cur.res(msgResult.data);
                else
                    cur.rej(msgResult.data);
            }
            this.next();
        };
        hostedThread.prototype.msgCallbackError = function (e) {
            alert('fatal error on crossdomain');
            console.log(e);
            var msgResult = this.cur;
            var cur = this.apiCallback[msgResult.mid];
            if (cur) {
                delete this.apiCallback[msgResult.mid];
                if (cur.msg && cur.msg.threadId)
                    clearTimeout(cur.msg.threadId);
                cur.rej(msgResult.data);
            }
            this.next();
        };
        Object.defineProperty(hostedThread.prototype, "isInit", {
            get: function () {
                return this.localeWindow && this.hostWindow;
            },
            enumerable: true,
            configurable: true
        });
        hostedThread.prototype.next = function () {
            if (!this.isInit)
                return false;
            if (!this.apiQuee.length)
                return this.cur = void 0, this.isExec = false;
            this.isExec = true;
            var msg = this.cur = this.apiQuee.shift();
            if (msg.timeout > 0)
                msg.threadId = setTimeout(this.timeOut, msg.timeout, this, msg);
            this.hostWindow.postMessage(msg, "*");
            return true;
        };
        hostedThread.prototype.timeOut = function (self, msg) {
            var c = self.apiCallback[msg.mid];
            if (!c)
                return;
            delete self.apiCallback[msg.mid];
            c.rej('timeout');
            self.next();
        };
        hostedThread.prototype.handleEvent = function (e) {
            switch (e.type) {
                case 'message':
                    return this.msgCallback(e);
                case 'messageerror':
                    return this.msgCallbackError(e);
            }
        };
        hostedThread.num = 0;
        return hostedThread;
    }());
    threading.hostedThread = hostedThread;
    function createLocaleThread() {
        var $window = window;
        if (_localeThread)
            return _localeThread;
        var apis = {
            fetch: $fetch,
            default: $fetch,
            $loaded: $loaded,
            $script: $script
        };
        var waitingLoading = [];
        var loaded = false;
        $window.addEventListener('load', function (e) {
            loaded = true;
            var l;
            while (l = waitingLoading.shift())
                process(l);
        });
        $window.addEventListener('message', function (e) {
            if (e.source == e.target)
                return;
            if (!loaded)
                return waitingLoading.push(e);
            process(e);
        });
        function process(e) {
            var msg = e.data;
            if (!msg.api)
                msg.api = 'default';
            if (!msg.mid)
                return;
            var api = apis[msg.api] || $noapi;
            api(msg, e, post);
        }
        function post(msg, e) {
            e.source.postMessage(msg, e.origin);
        }
        function parseJSON(data) {
            try {
                return data == "" || data == void 0 ? data : JSON.parse(data);
            }
            catch (_a) {
                return data;
            }
        }
        function $fetch(msg, e, post) {
            var dt = msg.data;
            http(dt.url, dt.method, dt.data, dt.headers)
                .then(function (v) { return post({ data: v, succ: true, mid: msg.mid, api: msg.api }, e); })
                .catch(function (v) { return post({ data: v, succ: false, mid: msg.mid, api: msg.api }, e); });
            function http(url, method, data, headers) {
                if (method === void 0) { method = "GET"; }
                data = JSON.stringify(data);
                return new Promise(function (res, rej) {
                    var xml = new XMLHttpRequest();
                    xml.open(method, url, true);
                    xml.send(data);
                    xml.addEventListener('loadend', function (v) {
                        var suc = xml.status == 200 || xml.status == 403;
                        v = parseJSON(xml.responseText);
                        if (suc)
                            res(v);
                        else
                            rej(v);
                    });
                    xml.addEventListener('error', function (v) {
                        rej();
                    });
                });
            }
        }
        function $noapi(msg, e, post) {
            post({ mid: msg.mid, succ: false, api: msg.api, data: void 0, err: "there no api found", errno: 1 }, e);
        }
        function $loaded(msg, e, post) {
            post({ mid: msg.mid, succ: true, api: msg.api, data: loaded }, e);
        }
        function $return(succ, data, msg, e) {
            post({ mid: msg.mid, succ: succ, api: msg.api, data: data }, e);
        }
        function $script(msg, e, post) {
            var scr = document.createElement('script');
            for (var n in msg.data)
                scr.setAttribute(n, msg.data[n]);
            $window.document.head.append(scr);
            scr.addEventListener('load', function (ex) {
                $return(true, void 0, msg, e);
            });
            scr.addEventListener('error', function (err) {
                $return(false, { lineno: err.lineno, colno: err.colno, message: err.message, filename: err.filename }, msg, e);
            });
        }
        return _localeThread = {
            register: function (name, handler) {
                apis[name] = handler;
            },
            unregister: function (name) {
                var c = { name: name, handler: apis[name] };
                delete apis[name];
                return c;
            },
            has: function (name) {
                return name in apis;
            },
            get: function (name) {
                return apis[name];
            },
            post: post,
            return: $return,
        };
    }
    threading.createLocaleThread = createLocaleThread;
    function createHostThread(name, src) {
        var frame = document.createElement('iframe');
        frame.classList.add('thread');
        frame.src = src;
        document.body.append(frame);
        frame.style.display = "none";
        frame.style.position = "fixed";
        frame.style.maxHeight = "0px";
        frame.style.maxWidth = "0px";
        var thread = new threading.hostedThread(name);
        frame.addEventListener('load', function (e) {
            thread.initialize(window, frame.contentWindow);
        });
        return thread;
    }
    threading.createHostThread = createHostThread;
    function currentLocaleThread() { return _localeThread; }
    threading.currentLocaleThread = currentLocaleThread;
    function getHostedThreads() {
        var p = {};
        for (var n in _hostedThreads)
            p[n] = _hostedThreads[n];
        return p;
    }
    threading.getHostedThreads = getHostedThreads;
})(threading || (threading = {}));
