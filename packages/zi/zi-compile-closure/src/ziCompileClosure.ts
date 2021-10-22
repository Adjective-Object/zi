import { readFile as readFileCb, createWriteStream, stat as statCb } from 'fs';
import { extname } from 'path';
import { promisify } from 'util';
import { fdir } from 'fdir';
import { Loader, transform } from 'esbuild';
import { runWithConcurrentLimit } from 'run-with-concurrent-limit';
import { serializeStreamEntry, ZiClosureMeta } from 'zi-closure';
import { relative as relativePath } from 'path';
import { slash } from 'mod-slash';
import { renderSync as renderSassSync } from 'sass';
import * as CommentJson from 'comment-json';
import flowRemoveTypes from 'flow-remove-types';
import type { ZiEntrypointOptions } from 'zi-config';
import 'colors';
import { nanoid } from 'nanoid';
import * as path from 'path';
import picomatch from 'picomatch';

export type RunOptions = {
    tsconfigPath: string;
    outputPath: string;
    rootDir: string;
    concurrency: number;
    preProcessSass: boolean;
    inputPatterns: string[];
    expectErrorOn: string[];
    expectWarningOn: string[];
    progressBar: boolean;
    singleModuleWarningSize: number;
    minify: boolean;
    entry: ZiEntrypointOptions;
};

const readFile = promisify(readFileCb);
const stat = promisify(statCb);

type MayHaveLocation = {
    pluginName?: string;
    location?: {
        column: number;
        line: number;
    };
    detail?: string;
    text: string;
};

function formatSingleErrorOrWarning(
    filePath: string,
    error: MayHaveLocation,
): string {
    return (
        `${error.pluginName ? `[${error.pluginName}] ` : ''}${filePath}` +
        (error.location
            ? `:${error.location.line}:${error.location.column}`
            : '') +
        ` ${error.text}${error.detail ? ` (${error.detail})` : ''}`
    );
}

function formatError(filePath: string, e: any) {
    if (e.errors?.length || e.warnings?.length) {
        return (
            (e.errors ?? [])
                .map(
                    (error: any) =>
                        `ERROR: ${formatSingleErrorOrWarning(filePath, error)}`
                            .red,
                )
                .join('  \n') +
            (e.warnings?.length && e.errors?.length ? '\n' : '') +
            (e.warnings ?? [])
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

function checkPathMatchesNoPatterns(
    patternStrings: string[],
    patternMatchers: picomatch.Matcher[],
    rootDir: string,
    crawlPathAbs: string,
) {
    if (patternStrings.length !== patternMatchers.length) {
        throw new Error('mismatch between patternStrings and patternMatchers');
    }
    for (let i = 0; i < patternMatchers.length; i++) {
        if (patternMatchers[i](path.relative(rootDir, crawlPathAbs))) {
            const matchedPatternStr = patternStrings[i];
            console.error(
                'Error pattern '.yellow +
                    `"${matchedPatternStr}"`.blue +
                    ' matched path '.yellow +
                    `"${path.relative(process.cwd(), crawlPathAbs)}"`.blue +
                    ' but transpilation did not error or warn.\n'.yellow +
                    '    Remove or update this entry in .ziconfig.expectErrorOn'
                        .yellow,
            );
        }
    }
}

async function matcherOrPathChecker(rootDir: string, patternOrPath: string) {
    try {
        const resolvedJoinedPath = path.resolve(rootDir, patternOrPath);
        await stat(resolvedJoinedPath);
        // statPromise throws ENOENT when the file does not exist
        // so here we know the file is at least present
        return (p: string) => path.resolve(rootDir, p) === resolvedJoinedPath;
    } catch (e) {
        return picomatch(patternOrPath);
    }
}

export async function run(options: RunOptions) {
    const {
        tsconfigPath,
        outputPath,
        inputPatterns,
        rootDir,
        concurrency,
        progressBar,
        entry,
        expectErrorOn,
        expectWarningOn,
        singleModuleWarningSize,
        minify,
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

    // check if the list is globs or files
    const inputIsFiles = (
        await Promise.all(
            inputPatterns.map(async (path) => {
                const pathStat = await stat(path).catch(() => null);
                return pathStat?.isFile;
            }),
        )
    ).every((x) => x);

    const resolvedRootDir = path.resolve(rootDir);
    const correctedInputGlobs = inputPatterns.map((globPattern) =>
        slash(path.join(resolvedRootDir, globPattern)),
    );

    // build the set of error and warning pattern checkers
    const expectErrorPatterns: ((path: string) => boolean)[] = [];
    const expectWarningPatterns: ((path: string) => boolean)[] = [];
    await Promise.all([
        runWithConcurrentLimit(
            Math.ceil(concurrency / 2),
            expectErrorOn,
            async (x) => {
                expectErrorPatterns.push(
                    await matcherOrPathChecker(rootDir, x),
                );
            },
        ),
        runWithConcurrentLimit(
            Math.ceil(concurrency / 2),
            expectWarningOn,
            async (x) => {
                expectWarningPatterns.push(
                    await matcherOrPathChecker(rootDir, x),
                );
            },
        ),
    ]);

    const fileList = inputIsFiles
        ? inputPatterns // glob files with fdir
        : await (new fdir()
              .glob(...correctedInputGlobs)
              .withSymlinks()
              .crawl(resolvedRootDir)
              .withPromise() as Promise<string[]>);

    const closureMeta: ZiClosureMeta = {
        compilation: {
            timestamp: new Date().toISOString(),
            id: nanoid(),
        },
        entry,
        fileCount: fileList.length,
    };

    // identify the closure with a random ID so the service worker
    // can detect if it is out of sync with the main app
    await outStreamWrite(serializeStreamEntry('meta', closureMeta) + '\n');

    if (fileList.length) {
        // transpile them with a concurrent limit
        await runWithConcurrentLimit(
            concurrency,
            fileList,
            async (crawlPath: string) => {
                const crawlPathRootRelative = path.relative(rootDir, crawlPath);
                try {
                    const fileContent = await getFileContent(
                        options,
                        crawlPath,
                    );
                    const transformResult = await transform(fileContent, {
                        tsconfigRaw,
                        loader: getLoaderFromExtension(crawlPath),
                        minify,
                    });

                    // don't write into the closure if the file was empty
                    // (e.g. it was a type-only file)
                    if (transformResult.code.length) {
                        if (
                            transformResult.code.length >
                            singleModuleWarningSize
                        ) {
                            const customWarning: MayHaveLocation = {
                                pluginName: 'zi-closure',

                                text: `Large entry "${path.relative(
                                    process.cwd(),
                                    crawlPath,
                                )}" (${
                                    Math.round(
                                        transformResult.code.length / 10000,
                                    ) / 100
                                } MB)`,
                            };
                            transformResult.warnings = [
                                ...(transformResult.warnings ?? []),
                                customWarning as any,
                            ];
                        }
                        const entryName =
                            '/' + slash(relativePath(rootDir, crawlPath));
                        await outStreamWrite(
                            serializeStreamEntry(
                                entryName,
                                transformResult.code,
                            ) + '\n',
                        );
                    }

                    if (transformResult.warnings.length) {
                        const shouldSuppressWarnings =
                            expectWarningPatterns.some((x) =>
                                x(crawlPathRootRelative),
                            );
                        if (!shouldSuppressWarnings) {
                            console.error(
                                `\n${formatError(
                                    crawlPathRootRelative,
                                    transformResult,
                                )}`,
                            );
                        }
                    } else {
                        // compilation succeded without warning -- check that
                        // it didn't match any of the expected warning patterns
                        checkPathMatchesNoPatterns(
                            expectWarningOn,
                            expectWarningPatterns,
                            rootDir,
                            crawlPath,
                        );
                    }

                    // compilation succeded without error -- check that
                    // it didn't match any of the expected error patterns
                    checkPathMatchesNoPatterns(
                        expectErrorOn,
                        expectErrorPatterns,
                        rootDir,
                        crawlPath,
                    );
                } catch (e) {
                    const errLike = e as {
                        warnings?: MayHaveLocation[];
                        errors?: MayHaveLocation[];
                    };
                    const unexpectedErrorLike = {
                        warnings:
                            errLike?.warnings?.length &&
                            !expectWarningPatterns.some((x) =>
                                x(crawlPathRootRelative),
                            )
                                ? errLike.warnings
                                : [],
                        errors:
                            errLike?.errors?.length &&
                            !expectErrorPatterns.some((x) =>
                                x(crawlPathRootRelative),
                            )
                                ? errLike.errors
                                : [],
                    };
                    if (
                        unexpectedErrorLike.errors.length ||
                        unexpectedErrorLike.warnings.length
                    ) {
                        console.error(
                            `\n${formatError(
                                crawlPathRootRelative,
                                unexpectedErrorLike,
                            )}`,
                        );
                    }
                }
            },
            progressBar, // progress
        );
    } else {
        console.warn('Found no files matching input globs!');
    }

    // write a single line with no trailing comma
    await outStreamWrite(`"__dummy__": null`);

    await outStreamWrite('}}');

    outStream.close();
}
