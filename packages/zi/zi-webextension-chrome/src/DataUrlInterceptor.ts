import type { Browser, WebRequest } from 'webextension-polyfill';
import type {
    RequestInterceptorCleanupFn,
    IRequestInterceptor,
    IZiWorkerBridge,
} from 'zi-webextension-generic';

export class DataUrlInterceptor implements IRequestInterceptor {
    constructor(private browser: Browser) {}

    register({
        baseUrl,
        getEntryFromClosure,
        shouldInterceptMainPage,
        getUpdatedDocument,
    }: IZiWorkerBridge): RequestInterceptorCleanupFn {
        async function listener(
            details: WebRequest.OnBeforeRequestDetailsType,
        ): Promise<WebRequest.BlockingResponse> {
            const parsedUrl = new URL(details.url);
            const closureEntry = await getEntryFromClosure(parsedUrl.pathname);

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
