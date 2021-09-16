import type { Browser } from 'webextension-polyfill';
import { popupMain } from 'zi-webextension-generic/lib/popup';

popupMain(chrome as unknown as Browser);
