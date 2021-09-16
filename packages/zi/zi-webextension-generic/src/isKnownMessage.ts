import { KnownMessage } from './messageDefinitions';

const KNOWN_MESSAGE_TYPES: KnownMessage['type'][] = [
    'state_for_popup',
    'popup_ready',
    'set_base_url',
];

export function isKnownMessage(message: any): message is KnownMessage {
    return (
        typeof message === 'object' &&
        message !== null &&
        KNOWN_MESSAGE_TYPES.indexOf(message?.type) !== -1
    );
}
