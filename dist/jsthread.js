export var threading;
(function (threading) {
    const _hostedThreads = {};
    let _localeThread;
    class hostedThread {
        constructor(name) {
            this.name = name;
            this.isExec = false;
            this.apiQuee = [];
            this.apiCallback = {};
            if (name in _hostedThreads)
                throw "the thread name is exist";
            _hostedThreads[name] = this;
        }
        destroy() {
            this.localeWindow.removeEventListener('message', this);
            this.localeWindow.removeEventListener('messageerror', this);
            delete _hostedThreads[this.name];
            this.apiQuee.length = 0;
        }
        initialize(localeWindow, hostWindow) {
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
        }
        newID() {
            let id = (hostedThread.num++).toString(36) + (Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
            if (id in this.apiCallback)
                return this.newID();
            return id;
        }
        sendCommand(api, data, timeout = 1500) {
            return new Promise((res, rej) => {
                const msg = {
                    mid: this.newID(),
                    data, api, timeout,
                };
                this.apiCallback[msg.mid] = { res, rej, msg };
                this.apiQuee.push(msg);
                if (!this.isExec)
                    this.next();
            });
        }
        msgCallback(e) {
            if (e.target !== window)
                return;
            var msgResult = e.data;
            if (!msgResult.mid)
                return;
            let cur = this.apiCallback[msgResult.mid];
            if (cur) {
                delete this.apiCallback[msgResult.mid];
                if (cur.msg && cur.msg.threadId)
                    clearTimeout(cur.msg.threadId);
                //const data:interfaces.ifetchResult<any>={data:msgResult.}
                if (msgResult.succ)
                    cur.res(msgResult.data);
                else
                    cur.rej(msgResult.data);
            }
            this.next();
        }
        msgCallbackError(e) {
            alert('fatal error on crossdomain');
            console.log(e);
            const msgResult = this.cur;
            let cur = this.apiCallback[msgResult.mid];
            if (cur) {
                delete this.apiCallback[msgResult.mid];
                if (cur.msg && cur.msg.threadId)
                    clearTimeout(cur.msg.threadId);
                cur.rej(msgResult.data);
            }
            this.next();
        }
        get isInit() {
            return this.localeWindow && this.hostWindow;
        }
        next() {
            if (!this.isInit)
                return false;
            if (!this.apiQuee.length)
                return this.cur = void 0, this.isExec = false;
            this.isExec = true;
            const msg = this.cur = this.apiQuee.shift();
            if (msg.timeout > 0)
                msg.threadId = setTimeout(this.timeOut, msg.timeout, this, msg);
            this.hostWindow.postMessage(msg, "*");
            return true;
        }
        timeOut(self, msg) {
            const c = self.apiCallback[msg.mid];
            if (!c)
                return;
            delete self.apiCallback[msg.mid];
            c.rej('timeout');
            self.next();
        }
        handleEvent(e) {
            switch (e.type) {
                case 'message':
                    return this.msgCallback(e);
                case 'messageerror':
                    return this.msgCallbackError(e);
            }
        }
    }
    hostedThread.num = 0;
    threading.hostedThread = hostedThread;
    function createLocaleThread() {
        const $window = window;
        if (_localeThread)
            return _localeThread;
        const apis = {
            $fetch,
            default: $fetch,
            $loaded,
            $script,
        };
        const waitingLoading = [];
        let loaded = false;
        $window.addEventListener('load', (e) => {
            loaded = true;
            let l;
            while (l = waitingLoading.shift())
                process(l);
        });
        $window.addEventListener('message', e => {
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
            let api = apis[msg.api] || $noapi;
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
        function getUrl(url) {
            const u = new URL(url.url, url.origin || document.location.origin);
            if (!url.params)
                return u.toString();
            for (const h in url.params)
                u.searchParams.set(h, url.params[h]);
            return u.toString();
        }
        function $fetch(msg, e, post) {
            http(msg.data)
                .then(v => post({ data: v, succ: true, mid: msg.mid, api: msg.api }, e))
                .catch(v => post({ data: v, succ: false, mid: msg.mid, api: msg.api }, e));
            function http(url) {
                return new Promise((res, rej) => {
                    var xml = new XMLHttpRequest();
                    if (!url.method)
                        url.method = "GET";
                    var data = JSON.stringify(url.data);
                    xml.open(url.method, getUrl(url), true);
                    xml.send(data);
                    xml.addEventListener('loadend', v => res({ data: parseJSON(xml.response), code: xml.status }));
                    xml.addEventListener('error', v => res({ data: void 0, code: 0 }));
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
            post({ mid: msg.mid, succ, api: msg.api, data: data }, e);
        }
        function $script(msg, e, post) {
            const scr = document.createElement('script');
            for (const n in msg.data)
                scr.setAttribute(n, msg.data[n]);
            $window.document.head.append(scr);
            scr.addEventListener('load', ex => {
                $return(true, void 0, msg, e);
            });
            scr.addEventListener('error', err => {
                $return(false, { lineno: err.lineno, colno: err.colno, message: err.message, filename: err.filename }, msg, e);
            });
        }
        return _localeThread = {
            register(name, handler) {
                apis[name] = handler;
            },
            unregister(name) {
                let c = { name: name, handler: apis[name] };
                delete apis[name];
                return c;
            },
            has(name) {
                return name in apis;
            },
            get(name) {
                return apis[name];
            },
            post,
            return: $return,
        };
    }
    threading.createLocaleThread = createLocaleThread;
    function createHostThread(name, src) {
        const frame = document.createElement('iframe');
        frame.classList.add('thread');
        frame.src = src;
        document.body.append(frame);
        frame.style.display = "none";
        frame.style.position = "fixed";
        frame.style.maxHeight = "0px";
        frame.style.maxWidth = "0px";
        let thread = new threading.hostedThread(name);
        frame.addEventListener('load', e => {
            thread.initialize(window, frame.contentWindow);
        });
        return thread;
    }
    threading.createHostThread = createHostThread;
    function currentLocaleThread() { return _localeThread; }
    threading.currentLocaleThread = currentLocaleThread;
    function getHostedThreads() {
        let p = {};
        for (const n in _hostedThreads)
            p[n] = _hostedThreads[n];
        return p;
    }
    threading.getHostedThreads = getHostedThreads;
})(threading || (threading = {}));
