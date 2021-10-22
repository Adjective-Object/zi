import { autorun, observable } from 'mobx';
import { Browser, Runtime, storage } from 'webextension-polyfill';
import { ClosureLoadState } from './ClosureLoadState';
import { getClosureUrl } from './getClosureUrl';
import { isKnownMessage } from './isKnownMessage';
import type {
    KnownMessage,
    StatsForPopoupMessage as StateForPopoupMessage,
} from './messageDefinitions';
import type { ZiClosureMeta } from 'zi-closure';
import { streamZiClosure } from './streamZiClosure';

type ExtensionState = {
    closureMeta: ZiClosureMeta | null;
    closureLoadState: ClosureLoadState;
    baseUrl: string;
};

function closureKey(closureMeta: ZiClosureMeta, fileName: string): string {
    return `${closureMeta.compilation.id}_${fileName}`;
}

async function batchStoreInClosure(
    closureMeta: ZiClosureMeta,
    entries: [string, string][],
) {
    await storage.local.set(
        Object.fromEntries(
            entries.map(([name, entryContent]) => [
                closureKey(closureMeta, name),
                entryContent,
            ]),
        ),
    );
}

async function clearStoredClosure() {
    await storage.local.clear();
}

async function getFromStoredClosure(
    closureMeta: ZiClosureMeta,
    name: string,
): Promise<string | null> {
    const key = closureKey(closureMeta, name);
    const storedResult = await storage.local.get([key]);
    return storedResult[key] ?? null;
}

type OnClosureUpdatedCb = (meta: ZiClosureMeta) => void;
const BATCH_STORE_SIZE = 1000;

async function fetchClosure(
    state: ExtensionState,
    onClosureUpdated: OnClosureUpdatedCb,
): Promise<ZiClosureMeta> {
    const closureUrl = getClosureUrl(state);
    const result = await fetch(closureUrl);
    if (!result.body) {
        throw new Error('Tried to fetch bodyless closure');
    }
    const bodyChunkReader = result.body.getReader();
    let thisClosureMeta: ZiClosureMeta | null = null;
    let pendingStoragePromises: Promise<void>[] = [];

    let collection: [string, string][] = [];
    function collectForStorage(name: string, entry: string) {
        if (!thisClosureMeta) {
            throw new Error('got entry before meta');
        }
        collection.push([name, entry]);
        if (collection.length >= BATCH_STORE_SIZE) {
            batchStoreInClosure(thisClosureMeta, collection);
            onClosureUpdated(thisClosureMeta);
            collection = [];
        }
    }

    await streamZiClosure(bodyChunkReader, (name: string, entry: any) => {
        if (name === 'meta') {
            thisClosureMeta = entry;
        } else {
            if (typeof entry !== 'string') {
                throw new Error(`entry had unexpected type ${typeof entry}`);
            }
            collectForStorage(name, entry);
        }
    });

    if (thisClosureMeta === null) {
        throw new Error('Closure did not contain a meta entry?');
    } else {
        // store remaining collection
        batchStoreInClosure(thisClosureMeta, collection);
        // await pending storage transactions
        await Promise.all(pendingStoragePromises);

        // update the closureMeta in the storage
        return thisClosureMeta;
    }
}

export interface IZiWorkerBridge {
    /**
     * Domain for which we are intercepting requests
     */
    baseUrl: string;
    /**
     * Gets a ZiClosure entry based on path
     */
    getEntryFromClosure: (path: string) => Promise<string | null>;
    /**
     * If a base path should be intercepted
     */
    shouldInterceptMainPage: (url: string) => boolean;
    /**
     * Updates the html body by replacing any
     */
    getUpdatedDocument: (oldRequestBody: string) => string;
}

export type RequestInterceptorCleanupFn = () => void;

export type RequestInterceptorRegisterFn = (
    bridge: IZiWorkerBridge,
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
        // TODO restore last meta from storage
        closureMeta: null,
        closureLoadState: { type: 'unloaded' },
        baseUrl: initialBaseUrl,
    });

    browser.runtime.onInstalled.addListener(() => {
        console.log('onInstalled!');
    });

    const activePorts: Set<Runtime.Port> = new Set();
    function broadcastOnOpenPorts(message: KnownMessage) {
        for (let port of activePorts) {
            try {
                port.postMessage(message);
            } catch {}
        }
    }

    browser.runtime.onConnect.addListener((port: Runtime.Port) => {
        activePorts.add(port);

        port.onDisconnect.addListener(() => {
            activePorts.delete(port);
        });

        port.onMessage.addListener(async (message) => {
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
                                state.closureLoadState.type,
                            )
                        ) {
                            // clear the old closure
                            state.closureMeta = null;
                            state.closureLoadState = { type: 'pending' };
                            port.postMessage(getStateMessage());
                            await clearStoredClosure();
                            try {
                                let processedFiles = 0;
                                state.closureMeta = await fetchClosure(
                                    state,
                                    (meta: ZiClosureMeta) => {
                                        processedFiles += 1;
                                        if (
                                            state.closureLoadState.type ===
                                            'pending'
                                        ) {
                                            state.closureLoadState.processedFiles =
                                                processedFiles;
                                            state.closureLoadState.totalFileCount =
                                                meta.fileCount;
                                        }
                                        broadcastOnOpenPorts(getStateMessage());
                                    },
                                );
                                state.closureLoadState = { type: 'success' };
                                broadcastOnOpenPorts(getStateMessage());
                            } catch (e) {
                                console.error(e);
                                state.closureLoadState = { type: 'failed' };
                                broadcastOnOpenPorts(getStateMessage());
                            }
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

    /**
     * If a main page request to the given url should be intercepted
     * (e.g. a request to a html document)
     * @param urlString - the main page url
     */
    function shouldInterceptMainPage(urlString: string) {
        if (!state.closureMeta) {
            return false;
        }
        try {
            const entrypointPaths = state.closureMeta.entry.entrypointPaths;
            const u = new URL(urlString);
            return entrypointPaths.includes(u.pathname);
        } catch {
            return false;
        }
    }

    /**
     * Given an html string of a HTML document, returns the updated version of that document.
     */
    function getUpdatedDocument(originalHtml: string) {
        const parser = new DOMParser();
        const dom = parser.parseFromString(originalHtml, 'text/html');
        if (!state.closureMeta?.entry) {
            throw new Error(
                'getUpdatedDocument called when there was no closure meta',
            );
        }
        const { injectHeadTags, scriptOverrideMap } = state.closureMeta.entry;
        // override script tag srcs
        let isDirty = false;
        for (let [oldScriptSrc, newScriptSrc] of Object.entries(
            scriptOverrideMap,
        )) {
            const existingTags = dom.querySelectorAll(
                `script[src="${oldScriptSrc}"]`,
            );
            if (existingTags.length) {
                isDirty = true;
                for (let tag of Array.from(existingTags)) {
                    tag.setAttribute('src', state.baseUrl + newScriptSrc);
                }
            }
        }

        if (injectHeadTags.length) {
            isDirty = true;
            let head = dom.documentElement.querySelector('head');
            if (!head) {
                // create and insert a head if none is present in the original doc
                const newHead = dom.createElement('head');
                dom.documentElement.insertBefore(
                    newHead,
                    dom.documentElement.firstChild,
                );
                head = newHead;
            }

            // Parse the script tag strings, to dom nodes,
            // and insert them at the head of the document
            const combinedInnerHtml = injectHeadTags.join('\n');
            const parserDiv = dom.createElement('div');
            parserDiv.innerHTML = combinedInnerHtml;
            for (let scriptNode of Array.from(parserDiv.childNodes)) {
                head.insertBefore(scriptNode, head.firstChild);
            }
        }

        return isDirty ? dom.documentElement.innerHTML : originalHtml;
    }

    console.log('setting up reaction to register an interceptor');
    // Listen to outgoing requests and intercept ones to baseUrl://
    // that exist within the closure
    let cleanupRequestInterceptor: RequestInterceptorCleanupFn | null = null;
    autorun(() => {
        let newCleanup = requestInterceptor.register({
            baseUrl: state.baseUrl,
            getEntryFromClosure: async (
                pathName: string,
            ): Promise<string | null> =>
                state.closureMeta &&
                getFromStoredClosure(state.closureMeta, pathName),
            shouldInterceptMainPage,
            getUpdatedDocument,
        });
        if (cleanupRequestInterceptor) {
            cleanupRequestInterceptor();
        }
        cleanupRequestInterceptor = newCleanup;
    });

    function getStateMessage(): StateForPopoupMessage {
        return {
            type: 'state_for_popup',
            closureLoadState: JSON.parse(
                JSON.stringify(state.closureLoadState),
            ),
            closureId: state.closureMeta?.compilation.id ?? null,
            baseUrl: state.baseUrl,
        };
    }
}
