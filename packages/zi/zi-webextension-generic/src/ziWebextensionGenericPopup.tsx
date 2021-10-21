import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { observable, runInAction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Browser, Runtime } from 'webextension-polyfill';
import { assertElement } from 'assert-element';
import type { PopupState } from './PopupState';
import { isKnownMessage } from './isKnownMessage';
import { KnownMessage } from './messageDefinitions';
import { getClosureUrl } from './getClosureUrl';

const BaseUrlInput = observer(function BaseUrlInput(props: {
    state: PopupState;
    port: Runtime.Port;
}) {
    const [localBaseUrl, setLocalBaseUrl] = React.useState(props.state.baseUrl);
    const updateLocalBaseUrl = React.useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setLocalBaseUrl(e.target.value);
        },
        [setLocalBaseUrl],
    );

    const clearIfEsc = React.useCallback(
        function clearIfEsc(e: React.KeyboardEvent<HTMLInputElement>) {
            if (e.key === 'Escape') {
                setLocalBaseUrl(props.state.baseUrl);
            }
        },
        [props.state.baseUrl],
    );

    const pushLocalBaseUrlToWorker = React.useCallback(
        function pushLocalBaseUrlToWorker() {
            const message: KnownMessage = {
                type: 'set_base_url',
                newBaseUrl: localBaseUrl,
            };
            props.port.postMessage(message);
        },
        [localBaseUrl],
    );

    return (
        <>
            <input
                value={localBaseUrl}
                onKeyPress={clearIfEsc}
                onInput={updateLocalBaseUrl}
            ></input>
            <button onClick={pushLocalBaseUrlToWorker}>Update Base Url</button>
        </>
    );
});

const BundleInfo = observer(function BundleInfo(props: {
    state: PopupState;
    port: Runtime.Port;
}) {
    const reloadClosure = React.useCallback(() => {
        const message: KnownMessage = {
            type: 'reload_closure',
        };
        props.port.postMessage(message);
    }, [props.port]);
    const closureLoadState = props.state.closureLoadState;
    return (
        <div>
            <div>
                Closure Load State?:{' '}
                {closureLoadState.type === 'pending' &&
                closureLoadState.processedFiles
                    ? `pending (${closureLoadState.processedFiles} files)`
                    : closureLoadState.type}
            </div>
            {closureLoadState.type === 'failed' ? (
                <div>
                    Was closure available at{' '}
                    <a href={getClosureUrl(props.state)}>
                        {getClosureUrl(props.state)}
                    </a>
                </div>
            ) : null}
            <button onClick={reloadClosure}>Reload Closure</button>
        </div>
    );
});

const Popup = observer(function Popup(props: {
    store: { state: PopupState | null };
    port: Runtime.Port;
}) {
    const state = props.store.state;
    if (state === null) {
        return null;
    } else {
        return (
            <div>
                {state.bannerMessage ? state.bannerMessage : null}
                <BaseUrlInput state={state} port={props.port} />
                <BundleInfo state={state} port={props.port} />
            </div>
        );
    }
});

export function popupMain(browser: Browser) {
    let store: { state: PopupState | null } = observable({
        state: null,
    });

    const port = browser.runtime.connect();
    port.onMessage.addListener((message) => {
        console.log('popup got message!', message);
        if (!isKnownMessage(message)) {
            throw new Error('got unknown message' + JSON.stringify(message));
        } else {
            switch (message.type) {
                case 'state_for_popup': {
                    const newState: PopupState = message;
                    runInAction(function updatestateInPopup() {
                        store.state = newState;
                        console.log(store);
                    });
                    return;
                }
            }
        }
    });

    ReactDOM.render(
        <Popup store={store} port={port} />,
        assertElement(HTMLDivElement, '#app-container'),
    );

    port.postMessage({ type: 'popup_ready' });
}
