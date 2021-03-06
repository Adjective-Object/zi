import { serviceWorkerMain } from 'zi-webextension-generic';
import type { Browser } from 'webextension-polyfill';
import { ChromeDebuggerInterceptor } from './ChromeDebuggerInterceptor';
serviceWorkerMain(
    chrome as unknown as Browser,
    'http://localhost:3000',
    new ChromeDebuggerInterceptor(chrome),
);

(self as any).onfetch = function onFetch(fetchEvent: any) {
    console.log('sw onfetch', fetchEvent);
};
