(function () {
    const l = threading.createLocaleThread();
    l.register('time', (m, e, post) => {
        l.return(true, Date.now(), m, e);
    })
})();