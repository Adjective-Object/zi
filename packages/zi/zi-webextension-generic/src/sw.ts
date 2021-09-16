import type { Browser } from 'webextension-polyfill';
import { isKnownMessage } from './isKnownMessage';
import type { StatsForPopoupMessage as StateForPopoupMessage } from './messageDefinitions';

type ZiClosure = {
    id: string;
    closure: Record<string, string>;
};
type ExtensionState = {
    closure: ZiClosure | null;
    baseUrl: string;
};

export function serviceWorkerMain(browser: Browser) {
    const state: ExtensionState = {
        closure: null,
        baseUrl: 'http://localhost:3000',
    };

    browser.runtime.onInstalled.addListener(() => {
        console.log('onInstalled!');
    });

    browser.runtime.onConnect.addListener((port) => {
        port.onMessage.addListener((message) => {
            console.log('message', message);

            if (isKnownMessage(message)) {
                switch (message.type) {
                    case 'popup_ready': {
                        return port.postMessage(getStateMessage());
                    }
                    case 'set_base_url': {
                        state.baseUrl = message.newBaseUrl;
                        return port.postMessage(getStateMessage());
                    }
                }
            } else {
                throw new Error(
                    'got unknown message! ' + JSON.stringify(message),
                );
            }
        });
    });

    function getStateMessage(): StateForPopoupMessage {
        return {
            type: 'state_for_popup',
            isClosureLoaded: state.closure !== null,
            closureId: state.closure?.id ?? null,
            baseUrl: state.baseUrl,
        };
    }
}
