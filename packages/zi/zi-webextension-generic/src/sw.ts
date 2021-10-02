import { autorun, observable, reaction } from 'mobx';
import type { Browser, WebRequest } from 'webextension-polyfill';
import { ClosureLoadState } from './ClosureLoadState';
import { getClosureUrl } from './getClosureUrl';
import { isKnownMessage } from './isKnownMessage';
import type { StatsForPopoupMessage as StateForPopoupMessage } from './messageDefinitions';
import { getFromClosure } from 'zi-closure';

type ZiClosure = {
    id: string;
    closure: Record<string, string>;
};
type ExtensionState = {
    closure: ZiClosure | null;
    closureLoadState: ClosureLoadState;
    baseUrl: string;
};

async function fetchClosure(state: ExtensionState): Promise<ZiClosure> {
    const closureUrl = getClosureUrl(state);
    const result = fetch(closureUrl);
    const resultJson = (await result).json();
    // TODO validate
    return resultJson;
}

export function serviceWorkerMain(browser: Browser) {
    const state: ExtensionState = observable({
        closure: null,
        closureLoadState: 'unloaded',
        baseUrl: 'http://localhost:3000',
    });

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
                    case 'reload_closure': {
                        if (
                            ['failed', 'unloaded'].includes(
                                state.closureLoadState,
                            )
                        ) {
                            state.closureLoadState = 'pending';
                            port.postMessage(getStateMessage());
                            fetchClosure(state).then(
                                (closure: ZiClosure) => {
                                    state.closure = closure;
                                    state.closureLoadState = 'success';
                                    port.postMessage(getStateMessage());
                                },
                                (e: any) => {
                                    console.error(e);
                                    state.closureLoadState = 'failed';
                                    port.postMessage(getStateMessage());
                                },
                            );
                            return;
                        }
                    }
                }
            } else {
                throw new Error(
                    'got unknown message! ' + JSON.stringify(message),
                );
            }
        });
    });

    console.log('registering a reaction');
    // Listen to outgoing requests and intercept ones to baseUrl://
    // that exist within the closure
    let oldListener:
        | ((details: WebRequest.OnBeforeRequestDetailsType) => void)
        | null;
    autorun(() => {
        console.log('registering listener on', state.baseUrl);
        function listener(details: WebRequest.OnBeforeRequestDetailsType) {
            const parsedUrl = new URL(details.url);
            console.log(
                `got request for ${details.url} (${parsedUrl.pathname})`,
            );
            if (state.closure) {
                const closureEntry = getFromClosure(state.closure);
                if (closureEntry) {
                    // intercept the request and serve from closure
                }
            }
        }
        if (oldListener) {
            browser.webRequest.onBeforeRequest.removeListener(oldListener);
        }
        oldListener = listener;
        browser.webRequest.onBeforeRequest.addListener(listener, {
            /**
             * A list of URLs or URL patterns. Requests that cannot match any of the URLs will be filtered out.
             */
            urls: [`${state.baseUrl}/*`],
            types: ['script'],
        });
    });

    function getStateMessage(): StateForPopoupMessage {
        return {
            type: 'state_for_popup',
            closureLoadState: state.closureLoadState,
            closureId: state.closure?.id ?? null,
            baseUrl: state.baseUrl,
        };
    }
}
