import { Browser } from 'webextension-polyfill';
import { assertElement } from 'assert-element';
import { PopupState } from './PopupState';
import { isKnownMessage } from './isKnownMessage';
import { KnownMessage } from './messageDefinitions';

export function popupMain(browser: Browser) {
    const localhostUrlInput = assertElement(HTMLInputElement, '#url-input');
    const setHostInput = assertElement(HTMLButtonElement, '#update-url-button');
    const messageBannerElement = assertElement(HTMLElement, '#message-banner');

    setHostInput.addEventListener('click', () => {
        const message: KnownMessage = {
            type: 'set_base_url',
            newBaseUrl: localhostUrlInput.value,
        };
        console.log(message);
        port.postMessage(message);
    });

    localhostUrlInput.addEventListener('input', updateUIToState);
    localhostUrlInput.addEventListener('change', updateUIToState);

    function updateUIToState() {
        if (!localhostUrlInput.contains(document.activeElement)) {
            localhostUrlInput.value = state?.baseUrl || '';
        }
        console.log('state', localhostUrlInput, state, localhostUrlInput.value);
        setHostInput.disabled = !!(
            state && localhostUrlInput.value === state.baseUrl
        );
        if (state?.bannerMessage) {
            messageBannerElement.innerText = state.bannerMessage.message;
            messageBannerElement.dataset.messageClass =
                state.bannerMessage.class;
        } else {
            delete messageBannerElement.dataset.messageClass;
        }
    }

    let state: PopupState | null = null;

    const port = browser.runtime.connect();
    port.postMessage({ type: 'popup_ready' });
    port.onMessage.addListener((message) => {
        console.log('message', message);
        if (!isKnownMessage(message)) {
            throw new Error('got unknown message' + JSON.stringify(message));
        } else {
            switch (message.type) {
                case 'state_for_popup': {
                    state = {
                        ...message,
                    };
                    updateUIToState();
                }
            }
        }
    });

    updateUIToState();
}
