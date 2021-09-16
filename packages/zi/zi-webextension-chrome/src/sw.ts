import { serviceWorkerMain } from 'zi-webextension-generic/lib/sw';
import type { Browser } from 'webextension-polyfill';
serviceWorkerMain(chrome as unknown as Browser);
