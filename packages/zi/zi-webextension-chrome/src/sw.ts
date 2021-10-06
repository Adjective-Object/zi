import { serviceWorkerMain } from 'zi-webextension-generic';
import type { Browser } from 'webextension-polyfill';
import { DataUrlInterceptor } from './DataUrlInterceptor';
serviceWorkerMain(
    chrome as unknown as Browser,
    new DataUrlInterceptor(chrome as unknown as Browser),
);
