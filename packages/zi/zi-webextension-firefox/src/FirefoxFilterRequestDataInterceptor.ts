import { IRequestInterceptor } from 'zi-webextension-generic';
import type { Browser, WebRequest } from 'webextension-polyfill';
import type { ZiClosureEntry } from 'zi-closure';

export class FirefoxFilterRequestDataInterceptor
    implements IRequestInterceptor
{
    constructor(private browser: Browser) {}

    register(
        baseUrl: string,
        getItemFromClosure: (relativePath: string) => ZiClosureEntry | null,
    ) {
        const onBeforeRequest = (
            details: WebRequest.OnBeforeRequestDetailsType,
        ): WebRequest.BlockingResponseOrPromise => {
            const parsedUrl = new URL(details.url);
            const closureEntry = getItemFromClosure(parsedUrl.pathname);

            if (closureEntry) {
                console.log('intercept', parsedUrl.pathname);

                let filter: WebRequest.StreamFilter =
                    this.browser.webRequest.filterResponseData(
                        details.requestId,
                    );
                let encoder = new TextEncoder();
                filter.onstart = () => {
                    // when the request would start, instead return
                    // the closure entry and perform nothing
                    filter.write(encoder.encode(closureEntry));
                    filter.close();
                };
            } else {
                console.log('passthrough', parsedUrl.pathname);
            }

            return {};
        };
        console.log('onBeforeRequest registered!~', `${baseUrl}/*`);

        // Firefox doesn't filter based on port here, so strip out any port: part of the url
        const portlessBaseUrl = baseUrl.replace(/:\d+/g, '');

        this.browser.webRequest.onBeforeRequest.addListener(
            onBeforeRequest,
            { urls: [`${portlessBaseUrl}/*`] },
            ['blocking', 'requestBody'],
        );
        return () => {
            console.log('onBeforeRequest cleaned!~');

            this.browser.webRequest.onBeforeRequest.removeListener(
                onBeforeRequest,
            );
        };
    }
}
