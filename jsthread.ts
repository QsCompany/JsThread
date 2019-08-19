module threading {
    const _hostedThreads: { [name: string]: hostedThread } = {};
    let _localeThread: IFrameThread;
    export declare type post = (msg: IMsgResult, e: MessageEvent) => void;
    export interface ApiCallbacks {
        [apiId: string]: { res: (value?: any) => void, rej: (reason?: any) => void, msg: IMsg };
    }
    export interface IMsg {
        mid: string;
        data: any;
        api: string;
        timeout?: number;
        threadId?: number;
    }
    export interface IMsgResult extends IMsg {
        succ: boolean;
        err?: any;
        errno?: number;
        data: any;
    }
    export interface IMsgData {
        url: string, method: string, headers: Headers, data: any
    }
    export interface IFrameThread {
        register(name: string, handler: (msg: IMsg, e: MessageEvent, post: post) => void): void;
        unregister(name: string): {
            name: string;
            handler: (msg: IMsg, e: MessageEvent, post: post) => void;
        };
        has(name: string): boolean;
        get(name: string): (msg: IMsg, e: MessageEvent, post: post) => void;
        post: (msg: IMsgResult, e: MessageEvent) => void;
        return: (succ: boolean, data: any, msg: IMsg, e: MessageEvent) => void;
    }

    export class hostedThread {
        private localeWindow: Window = void 0;
        private hostWindow: Window = void 0;
        constructor(public readonly name: string) {
            if (name in _hostedThreads) throw "the thread name is exist";
            _hostedThreads[name] = this;
        }
        destroy() {
            this.localeWindow.removeEventListener('message', this);
            this.localeWindow.removeEventListener('messageerror', this);
            delete _hostedThreads[this.name];
            this.apiQuee.length = 0;
        }
        initialize(localeWindow: Window, hostWindow: Window) {
            if (this.localeWindow) throw "is initialized";
            if (!localeWindow || !hostWindow) throw "arguments null";
            Object.defineProperty(this, 'localeWindow', { writable: false, configurable: false, value: localeWindow });
            Object.defineProperty(this, 'hostWindow', { writable: false, configurable: false, value: hostWindow });
            localeWindow.addEventListener('message', this);
            localeWindow.addEventListener('messageerror', this);
            this.next();
            return this;
        }
        private isExec: boolean = false;
        private apiQuee: IMsg[] = [];
        private apiCallback: ApiCallbacks = {};
        private cur: IMsg;
        private static num = 0;
        newID(): string {
            let id = (hostedThread.num++).toString(36) + (Math.random() * (Number as any).MAX_SAFE_INTEGER).toString(36);
            if (id in this.apiCallback) return this.newID();
            return id;
        }
        sendCommand<RESULT>(api: string, data?: any, timeout: number = 1500) {
            return new Promise<RESULT>((res, rej) => {
                const msg: IMsg = {
                    mid: this.newID(),
                    data, api, timeout,
                };
                this.apiCallback[msg.mid] = { res, rej, msg };
                this.apiQuee.push(msg);
                if (!this.isExec)
                    this.next();
            });
        }
        msgCallback(e: MessageEvent) {
            if (e.target !== window)
                return;
            var msgResult = e.data as IMsgResult;
            if (!msgResult.mid) return;
            let cur = this.apiCallback[msgResult.mid];

            if (cur) {
                delete this.apiCallback[msgResult.mid];
                if (cur.msg && cur.msg.threadId) clearTimeout(cur.msg.threadId);
                if (msgResult.succ)
                    cur.res(msgResult.data);
                else
                    cur.rej(msgResult.data);
            }
            this.next();
        }

        msgCallbackError(e: MessageEvent) {
            alert('fatal error on crossdomain');
            console.log(e);
            const msgResult = this.cur;
            let cur = this.apiCallback[msgResult.mid];
            if (cur) {
                delete this.apiCallback[msgResult.mid];
                if (cur.msg && cur.msg.threadId) clearTimeout(cur.msg.threadId);
                cur.rej(msgResult.data);
            }
            this.next();
        }
        get isInit() {
            return this.localeWindow && this.hostWindow;
        }
        next(): boolean {
            if (!this.isInit) return false;
            if (!this.apiQuee.length)
                return this.cur = void 0, this.isExec = false;
            this.isExec = true;
            const msg = this.cur = this.apiQuee.shift();
            if (msg.timeout > 0) msg.threadId = setTimeout(this.timeOut, msg.timeout, this, msg);
            this.hostWindow.postMessage(msg, "*");
            return true;
        }
        private timeOut(this: void, self: this, msg: IMsg) {
            const c = self.apiCallback[msg.mid];
            if (!c) return;
            delete self.apiCallback[msg.mid];
            c.rej('timeout');
            self.next();
        }
        handleEvent(e: MessageEvent) {
            switch (e.type) {
                case 'message':
                    return this.msgCallback(e);
                case 'messageerror':
                    return this.msgCallbackError(e);
            }

        }
    }
    export function createLocaleThread(): IFrameThread {
        const $window: Window = window;
        if (_localeThread) return _localeThread;
        const apis: { [s: string]: (msg: IMsg, e: MessageEvent, post: post) => void } = {
            fetch: $fetch,
            default: $fetch,
            $loaded,
            $script
        };
        const waitingLoading: MessageEvent[] = [];
        let loaded: boolean = false;
        $window.addEventListener('load', (e) => {
            loaded = true;
            let l: MessageEvent;
            while (l = waitingLoading.shift()) process(l);
        });
        $window.addEventListener('message', e => {
            if (e.source == e.target) return;
            if (!loaded) return waitingLoading.push(e);
            process(e);
        });
        function process(e: MessageEvent) {
            var msg: IMsg = e.data;
            if (!msg.api) msg.api = 'default';
            if (!msg.mid) return;
            let api = apis[msg.api] || $noapi;
            api(msg, e, post);
        }
        function post(msg: IMsgResult, e: MessageEvent) {
            (e.source as Window).postMessage(msg, e.origin);
        }
        function parseJSON(data: string) {
            try {
                return data == "" || data == void 0 ? data : JSON.parse(data);
            } catch{
                return data;
            }
        }
        function $fetch(msg: IMsg, e: MessageEvent, post: post) {
            var dt = msg.data;
            http(dt.url, dt.method, dt.data, dt.headers)
                .then(v => post({ data: v, succ: true, mid: msg.mid, api: msg.api }, e))
                .catch(v => post({ data: v, succ: false, mid: msg.mid, api: msg.api }, e));

            function http(url: string, method = "GET", data?: any, headers?: Headers): Promise<any> {
                data = JSON.stringify(data);
                return new Promise((res, rej) => {
                    var xml = new XMLHttpRequest();
                    xml.open(method, url, true);
                    xml.send(data);
                    xml.addEventListener('loadend', v => {
                        var suc = xml.status == 200 || xml.status == 403;
                        v = parseJSON(xml.responseText)
                        if (suc) res(v);
                        else rej(v);
                    });
                    xml.addEventListener('error', v => {
                        rej();
                    });
                });
            }
        }
        function $noapi(msg: IMsg, e: MessageEvent, post: post) {
            post({ mid: msg.mid, succ: false, api: msg.api, data: void 0, err: "there no api found", errno: 1 }, e);
        }
        function $loaded(msg: IMsg, e: MessageEvent, post: post) {
            post({ mid: msg.mid, succ: true, api: msg.api, data: loaded }, e);
        }
        function $return(succ: boolean, data: any, msg: IMsg, e: MessageEvent) {
            post({ mid: msg.mid, succ, api: msg.api, data: data }, e);
        }
        function $script(msg: IMsg, e: MessageEvent, post: post) {
            const scr = document.createElement('script');
            for (const n in msg.data as object)
                scr.setAttribute(n, msg.data[n]);
            $window.document.head.append(scr);
            scr.addEventListener('load', ex => {
                $return(true, void 0, msg, e);
            });
            scr.addEventListener('error', err => {
                $return(false, { lineno: err.lineno, colno: err.colno, message: err.message, filename: err.filename }, msg, e);
            })
        }
        return _localeThread = {
            register(name: string, handler: (msg: IMsg, e: MessageEvent, post: post) => void) {
                apis[name] = handler;

            },
            unregister(name: string) {
                let c = { name: name, handler: apis[name] };
                delete apis[name];
                return c;
            },
            has(name: string) {
                return name in apis;
            },
            get(name: string) {
                return apis[name];
            },
            post,
            return: $return,
        }
    }
    export function createHostThread(name: string, src: string) {
        const frame = document.createElement('iframe');
        frame.classList.add('thread');
        frame.src = src;
        document.body.append(frame);
        frame.style.display = "none";
        frame.style.position = "fixed";
        frame.style.maxHeight = "0px";
        frame.style.maxWidth = "0px";
        let thread: hostedThread = new threading.hostedThread(name);
        frame.addEventListener('load', e => {
            thread.initialize(window, frame.contentWindow);
        });
        return thread;
    }

    export function currentLocaleThread() { return _localeThread; }
    export function getHostedThreads() {
        let p: typeof _hostedThreads = {};
        for (const n in _hostedThreads)
            p[n] = _hostedThreads[n];
        return p;
    }
}