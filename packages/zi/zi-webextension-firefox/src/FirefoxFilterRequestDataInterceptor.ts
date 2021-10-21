import { IRequestInterceptor, IZiWorkerBridge } from 'zi-webextension-generic';
import type { Browser, WebRequest } from 'webextension-polyfill';
import type { ZiClosureEntry } from 'zi-closure';

export class FirefoxFilterRequestDataInterceptor
    implements IRequestInterceptor
{
    constructor(private browser: Browser) {}

    register({
        baseUrl,
        getEntryFromClosure,
        shouldInterceptMainPage,
        getUpdatedDocument,
    }: IZiWorkerBridge) {
        const interceptScriptRequest = async (
            details: WebRequest.OnBeforeRequestDetailsType,
        ): Promise<WebRequest.BlockingResponse> => {
            const parsedUrl = new URL(details.url);
            const closureEntry = await getEntryFromClosure(parsedUrl.pathname);

            if (closureEntry) {
                console.log('intercept script', parsedUrl.pathname);

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

        // Firefox doesn't filter based on port here, so strip out any port: part of the url
        const portlessBaseUrl = baseUrl.replace(/:\d+/g, '');
        this.browser.webRequest.onBeforeRequest.addListener(
            interceptScriptRequest,
            { urls: [`${portlessBaseUrl}/*`], types: ['script'] },
            ['blocking', 'requestBody'],
        );

        const interceptMainPageRequest = (
            details: WebRequest.OnBeforeRequestDetailsType,
        ): WebRequest.BlockingResponseOrPromise => {
            console.log('intercept main page?', details.url);

            if (shouldInterceptMainPage(details.url)) {
                console.log('intercept main page!', details.url);

                let filter: WebRequest.StreamFilter =
                    this.browser.webRequest.filterResponseData(
                        details.requestId,
                    );
                let htmlChunks: ArrayBuffer[] = [];
                filter.ondata = (e) => {
                    // collect the full html document chunk by chunk
                    htmlChunks.push(e.data);
                };
                filter.onstop = () => {
                    // collect the result into a single array buffer
                    const fullHtmlBuffer = new Uint8Array(
                        htmlChunks.reduce(
                            (sum: number, chunk: ArrayBuffer) =>
                                chunk.byteLength + sum,
                            0,
                        ),
                    );
                    let cumulativeOffset = 0;
                    for (let chunk of htmlChunks) {
                        fullHtmlBuffer.set(
                            new Uint8Array(chunk),
                            cumulativeOffset,
                        );
                        cumulativeOffset += fullHtmlBuffer.byteLength;
                    }

                    // decode and transform the accumulated result
                    const htmlText = new TextDecoder().decode(
                        fullHtmlBuffer,
                        {},
                    );
                    const transformedHtmlText = getUpdatedDocument(htmlText);

                    // write it to the client.
                    filter.write(new TextEncoder().encode(transformedHtmlText));
                    filter.close();
                };
            }

            return {};
        };

        // hook into main page requests!
        this.browser.webRequest.onBeforeRequest.addListener(
            interceptMainPageRequest,
            { urls: [`*://*/*?*gulp*`], types: ['main_frame'] },
            ['blocking', 'requestBody'],
        );
        return () => {
            this.browser.webRequest.onBeforeRequest.removeListener(
                interceptScriptRequest,
            );

            this.browser.webRequest.onBeforeRequest.removeListener(
                interceptMainPageRequest,
            );
        };
    }
}
