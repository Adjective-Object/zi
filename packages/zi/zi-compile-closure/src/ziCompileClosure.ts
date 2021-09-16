import { readFile as readFileCb, createWriteStream, stat as statCb } from 'fs';
import { promisify } from 'util';
import { fdir } from 'fdir';
import { transform } from 'esbuild';
import { runWithConcurrentLimit } from 'run-with-concurrent-limit';
import { nanoid } from 'nanoid';

const readFile = promisify(readFileCb);
const stat = promisify(statCb);

export async function run({
    tsconfigPath,
    outputPath,
    inputGlobsOrFiles,
    rootDir,
    concurrency,
    progressBar,
}: {
    tsconfigPath: string;
    outputPath: string;
    inputGlobsOrFiles: string[];
    rootDir: string;
    concurrency: number;
    progressBar: boolean;
}) {
    const tsconfigRaw = await readFile(tsconfigPath, 'utf-8').then(JSON.parse);
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
    await outStreamWrite(`{"id": "${nanoid()}", "closure": {`);

    // check if the list is globs or files
    const inputIsFiles = (
        await Promise.all(
            inputGlobsOrFiles.map(async (path) => {
                const pathStat = await stat(path).catch(() => null);
                return pathStat?.isFile;
            }),
        )
    ).every((x) => x);

    const fileList = inputIsFiles
        ? inputGlobsOrFiles // glob files with fdir
        : await (new fdir()
              .glob(...inputGlobsOrFiles)
              .withFullPaths()
              .crawl(rootDir)
              .withPromise() as Promise<string[]>);

    // compile them with a concurrent limit
    await runWithConcurrentLimit(
        concurrency,
        fileList,
        async (crawlPath: string) => {
            const transformResult = await transform(
                await readFile(crawlPath, 'utf-8'),
                { tsconfigRaw },
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
