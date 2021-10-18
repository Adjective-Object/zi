import { autorun, observable } from 'mobx';
import type { Browser } from 'webextension-polyfill';
import { ClosureLoadState } from './ClosureLoadState';
import { getClosureUrl } from './getClosureUrl';
import { isKnownMessage } from './isKnownMessage';
import type { StatsForPopoupMessage as StateForPopoupMessage } from './messageDefinitions';
import { getItemFromClosure } from 'zi-closure';
import type { ZiClosure } from 'zi-closure';

type ExtensionState = {
    closure: ZiClosure | null;
    closureLoadState: ClosureLoadState;
    baseUrl: string;
};

async function fetchClosure(state: ExtensionState): Promise<ZiClosure> {
    const closureUrl = getClosureUrl(state);
    console.log('fetching closure @', closureUrl);
    const result = await fetch(closureUrl);
    console.log('fetched, starting json parse!');
    const resultJson = await result.json();
    console.log('parse complete!');
    // TODO validate
    return resultJson;
}

export type RequestInterceptorCleanupFn = () => void;

export type RequestInterceptorRegisterFn = (
    baseUrl: string,
    getEntryFromClosure: (path: string) => string | null,
) => RequestInterceptorCleanupFn;
export interface IRequestInterceptor {
    register: RequestInterceptorRegisterFn;
}

export function serviceWorkerMain(
    browser: Browser,
    initialBaseUrl: string,
    requestInterceptor: IRequestInterceptor,
) {
    const state: ExtensionState = observable({
        closure: null,
        closureLoadState: 'unloaded',
        baseUrl: initialBaseUrl,
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

    console.log('setting up reaction to register an interceptor');
    // Listen to outgoing requests and intercept ones to baseUrl://
    // that exist within the closure
    let cleanupRequestInterceptor: RequestInterceptorCleanupFn | null = null;
    autorun(() => {
        let newCleanup = requestInterceptor.register(
            state.baseUrl,
            (pathName: string) =>
                state.closure && getItemFromClosure(state.closure, pathName),
        );
        if (cleanupRequestInterceptor) {
            cleanupRequestInterceptor();
        }
        cleanupRequestInterceptor = newCleanup;
    });

    function getStateMessage(): StateForPopoupMessage {
        return {
            type: 'state_for_popup',
            closureLoadState: state.closureLoadState,
            closureId: state.closure?.meta.compilation.id ?? null,
            baseUrl: state.baseUrl,
        };
    }
}
