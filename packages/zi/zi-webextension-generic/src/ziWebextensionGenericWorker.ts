import { autorun, observable } from 'mobx';
import { Browser, Runtime } from 'webextension-polyfill';
import { ClosureLoadState } from './ClosureLoadState';
import { getClosureUrl } from './getClosureUrl';
import { isKnownMessage } from './isKnownMessage';
import type {
    KnownMessage,
    StatsForPopoupMessage as StateForPopoupMessage,
} from './messageDefinitions';
import { ZI_CLOSURE_FORMAT_VERSION, ZiClosureMeta } from 'zi-closure';
import { ZiClosureStreamer } from './streamZiClosure';

declare const browser: Browser;

type ExtensionState = {
    closureMeta: ZiClosureMeta | null;
    closureLoadState: ClosureLoadState;
    baseUrl: string;
};

function closureKey(closureMeta: ZiClosureMeta, fileName: string): string {
    return `${closureMeta.compilation.id}_${fileName}`;
}

async function batchStoreClosureEntries(
    closureMeta: ZiClosureMeta,
    entries: [string, string][],
) {
    await browser.storage.local.set(
        Object.fromEntries(
            entries.map(([name, entryContent]) => [
                closureKey(closureMeta, name),
                entryContent,
            ]),
        ),
    );
    console.log('finished pushing to storage');
}

async function getStoredClosureMeta(): Promise<ZiClosureMeta | null> {
    const storedMeta =
        ((await browser.storage.local.get(['stored_meta']))[
            'stored_meta'
        ] as ZiClosureMeta) || undefined;
    if (
        storedMeta &&
        (storedMeta as Partial<ZiClosureMeta>)?.version ===
            ZI_CLOSURE_FORMAT_VERSION
    ) {
        return storedMeta;
    } else {
        return null;
    }
}

async function setStoredClosureMeta(meta: ZiClosureMeta): Promise<void> {
    await browser.storage.local.set({
        stored_meta: metam,
    });
}

async function clearStoredClosure() {
    await browser.storage.local.clear();
}

async function getFromStoredClosure(
    closureMeta: ZiClosureMeta,
    name: string,
): Promise<string | null> {
    const key = closureKey(closureMeta, name);
    const storedResult = await browser.storage.local.get([key]);
    return storedResult[key] ?? null;
}

type OnClosureUpdatedCb = (meta: ZiClosureMeta, currentCount: number) => void;
const BATCH_STORE_SIZE = 1000;

async function fetchClosure(
    state: ExtensionState,
    onClosureUpdated: OnClosureUpdatedCb,
): Promise<ZiClosureMeta> {
    const closureUrl = getClosureUrl(state);
    const result = await fetch(closureUrl);
    const resultBody = result.body;
    if (!resultBody) {
        throw new Error('Tried to fetch bodyless closure');
    }
    const bodyChunkReader = resultBody.getReader();
    let thisClosureMeta: ZiClosureMeta | null = null;
    let pendingStoragePromises: Promise<void>[] = [];

    let totalStored = 0;
    let collection: [string, string][] = [];
    function collectForStorage(name: string, entry: string) {
        if (!thisClosureMeta) {
            throw new Error('got entry before meta');
        }
        collection.push([name, entry]);
        if (collection.length >= BATCH_STORE_SIZE) {
            const mylen = collection.length;
            const metaOnUpdate = thisClosureMeta;
            pendingStoragePromises.push(
                batchStoreClosureEntries(metaOnUpdate, collection).then(() => {
                    totalStored += mylen;
                    onClosureUpdated(metaOnUpdate, totalStored);
                }),
            );
            collection = [];
        }
    }

    const oldStoredClosureMeta = await getStoredClosureMeta();

    const closureStreamer = new ZiClosureStreamer(
        bodyChunkReader,
        async (name: string, entry: any) => {
            if (name === 'meta') {
                thisClosureMeta = entry as ZiClosureMeta;
                if (thisClosureMeta.version !== ZI_CLOSURE_FORMAT_VERSION) {
                    throw new Error(
                        `Tried to load incompatible closure version ${ZI_CLOSURE_FORMAT_VERSION}, got ${thisClosureMeta.version}`,
                    );
                }
                if (
                    thisClosureMeta &&
                    oldStoredClosureMeta?.compilation.id ===
                        thisClosureMeta.compilation.id
                ) {
                    console.log('old stored closure was already a match');
                    closureStreamer.abortStream();
                    bodyChunkReader.cancel();
                    resultBody.cancel();
                } else {
                    await clearStoredClosure();
                }
            } else {
                if (typeof entry !== 'string') {
                    throw new Error(
                        `entry had unexpected type ${typeof entry}`,
                    );
                }
                collectForStorage(name, entry);
            }
        },
    );

    await closureStreamer.stream();

    if (thisClosureMeta === null) {
        throw new Error('Closure did not contain a meta entry?');
    } else {
        console.log('finalising any pending closure entries');
        // store remaining collection and
        // await pending storage transactions
        await Promise.all([
            ...pendingStoragePromises,
            batchStoreClosureEntries(thisClosureMeta, collection),
        ]);
        onClosureUpdated(thisClosureMeta, totalStored);
        // update the stored closure for the next time we try to load
        await setStoredClosureMeta(thisClosureMeta);

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
        closureMeta: null,
        closureLoadState: { type: 'unloaded' },
        baseUrl: initialBaseUrl,
    });

    browser.runtime.onInstalled.addListener(() => {
        console.log('onInstalled!');
        if (state.closureMeta === null) {
            // load initial stored closure from local storage
            getStoredClosureMeta().then((meta) => {
                if (meta) {
                    state.closureMeta = meta;
                    state.closureLoadState = {
                        type: 'success',
                    };
                    broadcastOnOpenPorts(getStateMessage());
                }
            });
        }
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
                            try {
                                state.closureMeta = await fetchClosure(
                                    state,
                                    (
                                        meta: ZiClosureMeta,
                                        processedFiles: number,
                                    ) => {
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
                                console.log('closure finished load!');
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
