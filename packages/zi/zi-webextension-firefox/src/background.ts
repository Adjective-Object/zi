import { serviceWorkerMain } from 'zi-webextension-generic';
import type { Browser } from 'webextension-polyfill';
import { FirefoxFilterRequestDataInterceptor } from './FirefoxFilterRequestDataInterceptor';

declare const browser: Browser;
serviceWorkerMain(
    browser,
    'http://localhost:3000',
    new FirefoxFilterRequestDataInterceptor(browser),
);

(self as any).onfetch = function onFetch(fetchEvent: any) {
    console.log('sw onfetch', fetchEvent);
};
