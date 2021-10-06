import type { Browser, WebRequest } from 'webextension-polyfill';
import { ZiClosureEntry } from 'zi-closure';
import type {
    RequestInterceptorCleanupFn,
    IRequestInterceptor,
} from 'zi-webextension-generic';

export class DataUrlInterceptor implements IRequestInterceptor {
    constructor(private browser: Browser) {}

    register(
        baseUrl: string,
        getEntryFromClosure: (closurePath: string) => ZiClosureEntry,
    ): RequestInterceptorCleanupFn {
        function listener(
            details: WebRequest.OnBeforeRequestDetailsType,
        ): WebRequest.BlockingResponseOrPromise {
            const parsedUrl = new URL(details.url);
            const closureEntry = getEntryFromClosure(parsedUrl.pathname);

            if (closureEntry) {
                // intercept the request and serve from closure
                const redirectUrl = `data:text/javascript;base64,${btoa(
                    closureEntry,
                )}`;
                console.log(
                    `intercepted request for ${details.url} (${parsedUrl.pathname}):`,
                    redirectUrl,
                );
                return {
                    redirectUrl,
                };
            } else {
                console.log(
                    `passthrough request for ${details.url} (${parsedUrl.pathname})`,
                );
                return {};
            }
        }

        // register the listener
        this.browser.webRequest.onBeforeRequest.addListener(
            listener,
            {
                /**
                 * A list of URLs or URL patterns. Requests that cannot match any of the URLs will be filtered out.
                 */
                urls: [`${baseUrl}/*`],
                types: ['script'],
            },
            ['blocking'],
        );

        // Callback to clean up the listener
        return () => {
            this.browser.webRequest.onBeforeRequest.removeListener(listener);
        };
    }
}
