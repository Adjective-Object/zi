export type PopupState = {
    baseUrl: string;
    isClosureLoaded: boolean;
    closureId: string | null;
    bannerMessage?: {
        class: 'error' | 'info';
        message: string;
    };
};
