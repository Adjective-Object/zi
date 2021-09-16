import { PopupState } from './PopupState';

export type PopupReadyMessage = {
    type: 'popup_ready';
};

export type StatsForPopoupMessage = {
    type: 'state_for_popup';
} & PopupState;

export type SetBaseUrlMessage = {
    type: 'set_base_url';
    newBaseUrl: string;
};

export type KnownMessage =
    | PopupReadyMessage
    | StatsForPopoupMessage
    | SetBaseUrlMessage;
