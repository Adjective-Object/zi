import { ClosureLoadState } from './ClosureLoadState';

export type PopupState = {
    baseUrl: string;
    closureLoadState: ClosureLoadState;
    closureId: string | null;
    bannerMessage?: {
        class: 'error' | 'info';
        message: string;
    };
};
