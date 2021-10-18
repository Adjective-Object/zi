import { readFile as readFileCb, createWriteStream, stat as statCb } from 'fs';
import { extname } from 'path';
import { promisify } from 'util';
import { fdir } from 'fdir';
import { Loader, transform } from 'esbuild';
import { runWithConcurrentLimit } from 'run-with-concurrent-limit';
import type { ZiClosure } from 'zi-closure';
import { relative as relativePath } from 'path';
import { slash } from 'mod-slash';
import { renderSync as renderSassSync } from 'sass';
import * as CommentJson from 'comment-json';
import flowRemoveTypes from 'flow-remove-types';
import type { ZiEntrypointOptions } from 'zi-config';
import 'colors';
import { nanoid } from 'nanoid';

export type RunOptions = {
    tsconfigPath: string;
    outputPath: string;
    inputGlobsOrFiles: string[];
    rootDir: string;
    concurrency: number;
    progressBar: boolean;
    preProcessSass: boolean;
    entry: ZiEntrypointOptions;
};

const readFile = promisify(readFileCb);
const stat = promisify(statCb);

type HasLocation = {
    pluginName?: string;
    location: {
        column: number;
        line: number;
    };
    detail?: string;
    text: string;
};

function formatSingleErrorOrWarning(
    filePath: string,
    error: HasLocation,
): string {
    return `${error.pluginName ? `[${error.pluginName}] ` : ''}${filePath}:${
        error.location.line
    }:${error.location.column}  ${error.text}${
        error.detail ? ` (${error.detail})` : ''
    }`;
}

function formatError(filePath: string, e: any) {
    if (e.errors?.length || e.warnings?.length) {
        return (
            e.errors
                .map(
                    (error: any) =>
                        `ERROR: ${formatSingleErrorOrWarning(filePath, error)}`
                            .red,
                )
                .join('  \n') +
            (e.warnings.length && e.errors.length ? '\n' : '') +
            e.warnings
                .map(
                    (warning: any) =>
                        `WARNING: ${formatSingleErrorOrWarning(
                            filePath,
                            warning,
                        )}`.yellow,
                )
                .join('  \n')
        );
    } else {
        return `Internal Error parsing ${filePath}: ${e}`.bgRed;
    }
}

async function getFileContent(
    options: RunOptions,
    fPath: string,
): Promise<string> {
    if (
        options.preProcessSass &&
        (fPath.endsWith('.scss') || fPath.endsWith('.sass'))
    ) {
        const sassResult = renderSassSync({
            file: fPath,
            sourceMapEmbed: true,
        });
        return sassResult.css.toString('utf-8');
    } else {
        const rawContent = await readFile(fPath, 'utf-8');
        if (fPath.endsWith('.json')) {
            const parsed = CommentJson.parse(rawContent);
            return JSON.stringify(parsed);
        } else if (
            fPath.endsWith('.js') &&
            rawContent.match(/^\s*(?:\*|\/\/)\s*@flow/g)
        ) {
            // strip flow comments
            return flowRemoveTypes(rawContent).toString();
        } else {
            return rawContent;
        }
    }
}

function getLoaderFromExtension(fPath: string): Loader | undefined {
    const ext = extname(fPath).substring(1);
    switch (ext) {
        case 'tsx':
        case 'ts':
        case 'json':
        case 'jsx':
        case 'css':
            return ext;
        case 'js':
            // HACK: many files declared with js extensions
            // in node_modules will _actually_ ship jsx code.
            // (example: react-shadow, istanbul-reports)
            //
            // Just parse every .js file with the jsx parser
            // to work around this.
            return 'jsx';
        case 'svg':
        case 'png':
        case 'jpeg':
        case 'jpg':
        case 'bmp':
            return 'dataurl';
        case 'txt':
        case 'graphql':
            return 'text';
        default:
            return undefined;
    }
}

export async function run(options: RunOptions) {
    const {
        tsconfigPath,
        outputPath,
        inputGlobsOrFiles,
        rootDir,
        concurrency,
        progressBar,
        entry,
    } = options;
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

    const closureMeta: ZiClosure['meta'] = {
        compilation: {
            timestamp: new Date().toISOString(),
            id: nanoid(),
        },
        entry,
    };

    // identify the closure with a random ID so the service worker
    // can detect if it is out of sync with the main app
    await outStreamWrite(
        `{"meta": ${JSON.stringify(closureMeta)}, "closure": {\n`,
    );

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
              .withSymlinks()
              .withBasePath()
              .crawl(rootDir)
              .withPromise() as Promise<string[]>);

    if (fileList.length) {
        // transpile them with a concurrent limit
        await runWithConcurrentLimit(
            concurrency,
            fileList,
            async (crawlPath: string) => {
                try {
                    const fileContent = await getFileContent(
                        options,
                        crawlPath,
                    );
                    const transformResult = await transform(fileContent, {
                        tsconfigRaw,
                        loader: getLoaderFromExtension(crawlPath),
                    });
                    if (transformResult.code.length) {
                        // don't write into the closure if the file was empty
                        // (e.g. it was a type-only file)
                        await outStreamWrite(
                            `${JSON.stringify(
                                '/' + slash(relativePath(rootDir, crawlPath)),
                            )}: ${JSON.stringify(transformResult.code)},\n`,
                        );
                    }
                } catch (e) {
                    console.error(`\n${formatError(crawlPath, e)}`);
                }
            },
            progressBar, // progress
        );
    }

    // write a single line with no trailing comma
    await outStreamWrite(`"__dummy__": null`);

    await outStreamWrite('}}');

    outStream.close();
}
