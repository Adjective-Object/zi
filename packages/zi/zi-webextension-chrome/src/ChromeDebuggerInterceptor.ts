import type { Browser, WebRequest } from 'webextension-polyfill';
import { ZiClosureEntry } from 'zi-closure';
import type {
    RequestInterceptorCleanupFn,
    IRequestInterceptor,
} from 'zi-webextension-generic';

export class ChromeDebuggerInterceptor implements IRequestInterceptor {
    constructor(private chromeBrowser: typeof chrome) {}

    register(
        baseUrl: string,
        getEntryFromClosure: (closurePath: string) => ZiClosureEntry,
    ): RequestInterceptorCleanupFn {
        // this.chromeBrowser.debugger.getTargets((targets) => {
        //     console.log('found targets', targets);
        //     let target = targets[0]; // TODO find the target somehow?
        //     let debuggee = { targetId: target.id };

        //     chrome.debugger.attach(debuggee, '1.2', () => {
        //         chrome.debugger.sendCommand(
        //             debuggee,
        //             'Network.setRequestInterceptionEnabled',
        //             { enabled: true },
        //         );
        //     });

        //     chrome.debugger.onEvent.addListener((source, method, params) => {
        //         if (
        //             source.targetId === target.id &&
        //             method === 'Network.requestIntercepted'
        //         ) {
        //             console.log('debugger request for', source, method, params);
        //         }
        //     });
        // });

        return () => {
            // TODO: actually implement cleanup
        };
    }
}
