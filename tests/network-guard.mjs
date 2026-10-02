// Browser gates serve their own fixtures. Never initialise the live project or send
// traffic outside loopback, including requests made by a service worker. Page routes
// can still fulfil synthetic CDN failure/delay scenarios without contacting a host.
export async function launchLocalBrowser(chromium, options = {}) {
    const browser = await chromium.launch({ ...options, args: [
        ...(options.args || []),
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1]'
    ] });
    const guarded = new WeakSet();
    const protect = async context => {
        if (guarded.has(context)) return;
        guarded.add(context);
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
                || ['data:', 'blob:', 'about:'].includes(url.protocol)
                ? route.continue() : route.abort('blockedbyclient');
        });
    };
    const context = browser.newContext.bind(browser);
    browser.newContext = async options => {
        const value = await context(options);
        await protect(value);
        return value;
    };
    const page = browser.newPage.bind(browser);
    browser.newPage = async options => {
        const value = await page(options);
        await protect(value.context());
        return value;
    };
    return browser;
}
