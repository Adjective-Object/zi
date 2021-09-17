import { TransformFailure, transformSync } from 'esbuild';
import * as CommentJson from 'comment-json';
import {
    readFile as readFileCb,
    writeFile as writeFileCb,
    stat as statCb,
} from 'fs';
import { promisify } from 'util';
import { fdir } from 'fdir';
import * as path from 'path';
import mkdirp from 'mkdirp';

const readFile = promisify(readFileCb);
const writeFile = promisify(writeFileCb);
const stat = promisify(statCb);

const BUILD_INFO_FILENAME = '.esbp-timestamp';
const TSCONFIG_NAME = 'tsconfig.cjs.json';
type BuildInfo = {
    inputRoot: string;
    inputGlobs: string[];
    outputRoot: string;
    outputFiles: string[];
};

function getBuildInfoPathFromTsconfig(tsconfigPath: string): string {
    return path.resolve(
        path.join(path.dirname(tsconfigPath), BUILD_INFO_FILENAME),
    );
}

function getDefaultBuildInfo(): BuildInfo {
    return {
        inputRoot: './src',
        inputGlobs: ['**/src/**/*.ts', '**/src/**/*.tsx'],
        outputRoot: './src',
        outputFiles: [],
    };
}

async function isBuildUpToDate(
    buildInfoPath: string,
): Promise<[boolean, string[]]> {
    const buildInfoStat = await stat(buildInfoPath).catch((e) => null);

    const buildInfo: BuildInfo = buildInfoStat
        ? CommentJson.parse(await readFile(buildInfoPath, 'utf-8'))
        : getDefaultBuildInfo();

    const relativeToInfo = (p: string) =>
        path.join(path.dirname(buildInfoPath), p);

    const inputFilesPromise = new fdir()
        .glob(...buildInfo.inputGlobs)
        .withFullPaths()
        .crawl(relativeToInfo(buildInfo.inputRoot))
        .withPromise() as Promise<string[]>;
    const inputFiles = await inputFilesPromise;

    const outputFiles = [
        ...buildInfo.outputFiles.map(relativeToInfo),
        buildInfoPath,
    ];

    const [inputTimes, outputTimes] = await Promise.all([
        Promise.all(
            [...inputFiles, relativeToInfo(TSCONFIG_NAME)].map(async (f) => {
                const fstat = await stat(f);
                return fstat.atimeMs;
            }),
        ),
        Promise.all(
            outputFiles.map(async (f) => {
                try {
                    const fstat = await stat(f);
                    return fstat.atimeMs;
                } catch (e) {
                    console.warn(`output file ${f} was missing`);
                    return -Infinity;
                }
            }),
        ),
    ]);

    return [Math.max(...inputTimes) < Math.min(...outputTimes), inputFiles];
}

async function getDependenciesPaths(
    buildInfoFilePath: string,
): Promise<string[]> {
    const tsconfigPath = path.join(
        path.dirname(buildInfoFilePath),
        TSCONFIG_NAME,
    );

    const tsconfig = CommentJson.parse(await readFile(tsconfigPath, 'utf-8'));

    return tsconfig.references.map((reference: { path: string }) =>
        getBuildInfoPathFromTsconfig(
            path.join(path.dirname(tsconfigPath), reference.path),
        ),
    );
}

async function findStaleSubprojects(
    rootBuildInfoPath: string,
): Promise<Map<string, string[]>> {
    const frontier = [rootBuildInfoPath];
    let frontierPromises = [];

    const seen = new Set<string>(frontier);
    const staleProjectsToInputs = new Map<string, string[]>();

    while (frontier.length || frontierPromises.length) {
        if (!frontier.length || frontierPromises.length > MAX_FRONTIER_SCANS) {
            await Promise.all(frontierPromises);
            frontierPromises = [];
        } else {
            const buildInfoPath = frontier.pop();
            frontierPromises.push(
                (async () => {
                    const [wasUpToDate, inputs] = await isBuildUpToDate(
                        buildInfoPath,
                    );
                    if (!wasUpToDate) {
                        staleProjectsToInputs.set(buildInfoPath, inputs);
                    }

                    const dependentBuildInfo = await getDependenciesPaths(
                        buildInfoPath,
                    );
                    for (let f of dependentBuildInfo) {
                        if (f && !seen.has(f)) {
                            seen.add(f);
                            frontier.push(f);
                        }
                    }
                })(),
            );
        }
    }

    return staleProjectsToInputs;
}

async function buildSubproject(buildInfoPath: string, inputFiles: string[]) {
    // get buildinfo or default
    const buildInfoStat = await stat(buildInfoPath).catch((e) => null);
    const buildInfo: BuildInfo = buildInfoStat
        ? (CommentJson.parse(
              await readFile(buildInfoPath, 'utf-8'),
          ) as BuildInfo)
        : getDefaultBuildInfo();

    let errors: string[] = [];

    await Promise.all(
        inputFiles.map(async (i) => {
            try {
                const content = await readFile(i, 'utf-8');

                const ext = path.extname(i).substring(1);
                // legal loaders by extenson, fall back to using 'file'.
                const loader =
                    ext === 'tsx'
                        ? 'tsx'
                        : ext === 'json'
                        ? 'json'
                        : ext === 'jsx'
                        ? 'jsx'
                        : ext === 'js'
                        ? 'js'
                        : ext === 'css'
                        ? 'css'
                        : ext === 'ts'
                        ? 'ts'
                        : ext === 'txt'
                        ? 'text'
                        : 'file';

                const outCjs = transformSync(content, {
                    sourcefile: i,
                    sourcemap: true,
                    format: 'cjs',
                    loader,
                });

                const outEsm = transformSync(content, {
                    sourcefile: i,
                    sourcemap: true,
                    format: 'esm',
                    loader,
                });

                const relativePath =
                    path.basename(path.relative(buildInfo.inputRoot, i)) +
                    '.js';
                const relativeSourceMapPath = relativePath + '.map';

                await Promise.all([
                    mkdirp(
                        path.dirname(
                            path.join(
                                buildInfo.outputRoot,
                                'cjs',
                                relativePath,
                            ),
                        ),
                    ),
                    mkdirp(
                        path.dirname(
                            path.join(
                                buildInfo.outputRoot,
                                'mjs',
                                relativePath,
                            ),
                        ),
                    ),
                ]);

                await Promise.all([
                    writeFile(
                        path.join(buildInfo.outputRoot, 'cjs', relativePath),
                        outCjs.code,
                    ),
                    writeFile(
                        path.join(
                            buildInfo.outputRoot,
                            'cjs',
                            relativeSourceMapPath,
                        ),
                        outCjs.code,
                    ),
                    writeFile(
                        path.join(buildInfo.outputRoot, 'mjs', relativePath),
                        outEsm.code,
                    ),
                    writeFile(
                        path.join(
                            buildInfo.outputRoot,
                            'cjs',
                            relativeSourceMapPath,
                        ),
                        outCjs.code,
                    ),
                ]);
            } catch (e) {
                errors.push(formatEsbuildError(i, e as TransformFailure));
            }
        }),
    );

    // update buildinfo file
    const buildSlug = path.dirname(buildInfoPath);
    if (errors.length) {
        console.error(
            `Errors while transforming ${buildSlug}:\n`,
            errors.map((x) => '  ' + x).join('\n'),
        );
    } else {
        console.log('writing updated buildinfo', buildSlug);
        await writeFile(buildInfoPath, JSON.stringify(buildInfo, null, 4));
    }
}

function formatEsbuildError(file: string, err: TransformFailure) {
    let out: string[] = [];
    if (err.errors) {
        out.push(
            err.errors
                .map(
                    (e) =>
                        `ERROR: ${e.location.file}:${e.location.line}:${e.location.column} ${e.text}`,
                )
                .join('\n'),
        );
    }
    if (err.warnings) {
        out.push(
            err.warnings
                .map(
                    (e) =>
                        `WARNING: ${e.location.file}:${e.location.line}:${e.location.column} ${e.text}`,
                )
                .join('\n'),
        );
    }

    return out.join('\n');
}

const MAX_FRONTIER_SCANS = 5;
async function main() {
    const tsconfigPath = `./${TSCONFIG_NAME}`;
    const rootBuildInfoPath = getBuildInfoPathFromTsconfig(tsconfigPath);
    const staleProjects = await findStaleSubprojects(rootBuildInfoPath);
    if (!staleProjects.size) {
        console.log('all subprojects were up to date');
        process.exit(0);
    }

    console.log(
        'Rebuilding stale projects:\n',
        [...staleProjects.keys()]
            .map((x) => path.relative(process.cwd(), x))
            .join('\n'),
    );

    await Promise.all(
        [...staleProjects.entries()].map(([projectPath, inputFiles]) =>
            buildSubproject(projectPath, inputFiles),
        ),
    );
}

main();
