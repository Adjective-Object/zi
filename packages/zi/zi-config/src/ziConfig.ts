import { readFile as readFileCb, stat as statCb } from 'fs';
import type { Stats } from 'fs';
import { promisify } from 'util';
import * as CommentJson from 'comment-json';
import path from 'path';

const readFilePromise = promisify(readFileCb);
const statPromise = promisify(statCb);

export type ZiEntrypointOptions = {
    /**
     * Paths of main scripts to intercept.
     *
     * When a script is intercepted, any
     * entrypoint scripts will be substituted
     * for according to scriptOverrideMap
     */
    entrypointPaths: string[];

    /**
     * HTML literals to inject at the end of the HEAD of the document
     */
    injectHeadTags: string[];

    /**
     * Record of original script entrypoint to the intercepted
     * script entrypoint.
     */
    scriptOverrideMap: Record<string, string>;
};

export type ZiClosureOptions = {
    /**
     * Path to tsconfig.json, relative to 'rootDir'
     */
    tsconfigPath: string;
    /**
     * Path to the zi closure, relative to 'rootDir'
     */
    outputPath: string;
    /**
     * the root directory. Defaults to the directory of
     * the closure file.
     */
    rootDir: string;
    /**
     * maximum number of files to compile at the same time.
     * (default 200). This will be limited by the number of
     * maximum file handles a process can have open at one time
     *
     * On linux this means is the process ulimit. On Windows
     * it is a dynamic resource cap.
     */
    concurrency: number;
    /**
     * If files ending with .scss and .sass should
     * be precompiled before being stored in the closure
     */
    preProcessSass: boolean;
    /**
     * Globs to match against the results of the file discovery,
     * judged against the rootDir.
     */
    inputPatterns: string[];
    /**
     * globs that we expect to have problems compiling.
     * Intended for use suppressing errors from
     * node_modules files, since some of those files
     * are not transpileable (e.g. preamble / outro script fragments)
     */
    expectErrorOn: string[];
    /**
     * globs that we expect to have problems compiling.
     * Intended for use suppressing errors from
     * node_modules files, since some of those files
     * are not transpileable (e.g. preamble / outro script fragments)
     */
    expectWarningOn: string[];
};

export type ZiConfig = {
    fromFilePath?: string;
    entry: ZiEntrypointOptions;
    closure: ZiClosureOptions;
};

const DEFAULT_ZI_CONFIG_NAME = '.ziconfig';
const DEFAULT_CONFIG: ZiConfig = {
    entry: {
        entrypointPaths: [],
        injectHeadTags: [
            "<script type='module' src='https://localhost:3000/@vite/client'></script>",
            "<script type='module'>\nimport RefreshRuntime from 'https://localhost:3000/@react-refresh'\nRefreshRuntime.injectIntoGlobalHook(window)\nwindow.$RefreshReg$ = () => {}\nwindow.$RefreshSig$ = () => (type) => type\nwindow.__vite_plugin_react_preamble_installed__ = true\n</script>",
        ],
        scriptOverrideMap: {},
    },
    closure: {
        tsconfigPath: 'tsconfig.json',
        outputPath: 'zi-closure.json',
        rootDir: '.',
        concurrency: 200,
        preProcessSass: true,
        inputPatterns: ['**/*.js', '**/*.ts'],
        expectErrorOn: [],
        expectWarningOn: [],
    },
};

function validateAndMerge<T extends Record<string, any>>(
    real: any,
    base: T,
    keyPath?: string,
): T {
    if (!real) {
        return JSON.parse(JSON.stringify(base));
    }

    const extraKeys = Object.keys(real).filter(
        (realKey) => !base.hasOwnProperty(realKey),
    );
    if (extraKeys.length) {
        throw new Error(
            `Config had extra keys: ${extraKeys.map((k) =>
                keyPath ? `${keyPath}.${k}` : k,
            )}`,
        );
    }

    return Object.fromEntries(
        Object.entries(base).map(([k, v]) => {
            if (real.hasOwnProperty(k)) {
                return [k, JSON.parse(JSON.stringify(real[k]))];
            } else {
                return [k, JSON.parse(JSON.stringify(v))];
            }
        }),
    ) as T;
}

function cleanupConfig(configCandidate: any): ZiConfig {
    if (typeof configCandidate !== 'object') {
        throw new Error('Config was not an object');
    }
    return {
        entry: validateAndMerge(
            configCandidate.entry,
            DEFAULT_CONFIG.entry,
            'entry',
        ),
        closure: validateAndMerge(
            configCandidate.closure,
            DEFAULT_CONFIG.closure,
            'closureOptions',
        ),
    };
}

export async function getZiConfigFromDisk(
    startingDir: string,
    ziConfigName?: string,
): Promise<ZiConfig> {
    const ziConfigFileName = ziConfigName ?? DEFAULT_ZI_CONFIG_NAME;
    let pathSegments = startingDir.split(path.sep);
    let lastPathCandidate: string | undefined;
    let stats: undefined | Stats;
    do {
        lastPathCandidate = path.join(...pathSegments, ziConfigFileName);
        try {
            stats = undefined;
            stats = await statPromise(lastPathCandidate);
        } catch {
            lastPathCandidate = undefined;
        }

        pathSegments.pop();
    } while (pathSegments.length && (stats === undefined || !stats.isFile()));

    if (!lastPathCandidate) {
        throw new Error(
            `failed to find ${ziConfigFileName} in any parent directory of ${startingDir}`,
        );
    } else {
        const cleanConfig = cleanupConfig({
            ...CommentJson.parse(
                await readFilePromise(lastPathCandidate, 'utf-8'),
            ),
        });
        return {
            fromFilePath: lastPathCandidate,
            ...cleanConfig,
        };
    }
}
