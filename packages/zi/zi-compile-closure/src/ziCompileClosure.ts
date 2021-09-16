import { readFile as readFileCb, createWriteStream } from 'fs';
import { promisify } from 'util';
import { fdir } from 'fdir';
import { transform } from 'esbuild';
import { runWithConcurrentLimit } from 'run-with-concurrent-limit';
import { nanoid } from 'nanoid';

const readFile = promisify(readFileCb);

export async function run({
    esbuildConfigPath,
    outputPath,
    inputGlobs,
    rootDir,
    concurrency,
    progressBar,
}: {
    esbuildConfigPath: string;
    outputPath: string;
    inputGlobs: string[];
    rootDir: string;
    concurrency: number;
    progressBar: boolean;
}) {
    const transformOptions = await readFile(esbuildConfigPath, 'utf-8').then(
        JSON.parse,
    );
    const outStream = createWriteStream(outputPath);
    const outStreamWrite = (str: string) =>
        new Promise<void>((res, rej) => {
            outStream.write(str, 'utf-8', (err) => {
                if (err) {
                    rej(err);
                } else {
                    res();
                }
            });
        });

    // identify the closure with a random ID so the service worker
    // can detect if it is out of sync with the main app
    await outStreamWrite(`{"id":${nanoid()}, "closure": {`);

    // find all files
    const crawlResults = await (new fdir()
        .glob(...inputGlobs)
        .withFullPaths()
        .crawl(rootDir)
        .withPromise() as Promise<string[]>);

    // compile them with a concurrent limit
    await runWithConcurrentLimit(
        concurrency,
        crawlResults,
        async (crawlPath: string) => {
            const transformResult = await transform(
                await readFile(crawlPath, 'utf-8'),
                transformOptions,
            );
            await outStreamWrite(
                `"${crawlPath}": "${JSON.stringify(transformResult.code)}","`,
            );
        },
        progressBar, // progress
    );

    // write a single line with no trailing comma
    await outStreamWrite(`"__dummy__": null`);

    await outStreamWrite('}}');

    outStream.close();
}
