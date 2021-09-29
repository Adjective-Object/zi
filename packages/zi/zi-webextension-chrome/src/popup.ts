import type { Browser } from 'webextension-polyfill';
import { popupMain } from 'zi-webextension-generic';

popupMain(chrome as unknown as Browser);
