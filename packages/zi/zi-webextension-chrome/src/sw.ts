import { serviceWorkerMain } from 'zi-webextension-generic';
import type { Browser } from 'webextension-polyfill';
serviceWorkerMain(chrome as unknown as Browser);
