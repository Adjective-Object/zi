import type { MatchPathAsync } from 'tsconfig-paths';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
const stat = promisify(fs.stat);

export async function matchPathPromise(
    matchPath: MatchPathAsync,
    importSpecifier: string,
    legalExtensions: string[],
): Promise<string | undefined> {
    return new Promise((resolve, reject) =>
        matchPath(
            importSpecifier,
            undefined, // readJson
            undefined, // fileExists
            legalExtensions, //extensions
            async (err: Error, result: string) => {
                if (err) {
                    reject(err);
                } else if (!result) {
                    resolve(undefined);
                } else {
                    if (
                        isFile(result) &&
                        legalExtensions.some((extension) =>
                            result.endsWith(extension),
                        )
                    ) {
                        // this is an exact require of a known script extension, resolve
                        // it up front
                        resolve(result);
                    } else {
                        // tsconfig-paths returns a path without an extension.
                        // if it resolved to an index file, it returns the path to
                        // the directory of the index file.
                        if (await isDirectory(result)) {
                            resolve(
                                checkExtensions(
                                    path.join(result, 'index'),
                                    legalExtensions,
                                ),
                            );
                        } else {
                            resolve(checkExtensions(result, legalExtensions));
                        }
                    }
                }
            },
        ),
    );
}

async function isFile(filePath: string): Promise<boolean> {
    try {
        // stat will throw if the file does not exist
        const statRes = await stat(filePath);
        if (statRes.isFile()) {
            return true;
        }
    } catch {
        // file does not exist
        return false;
    }
    throw new Error('Unreachable code in isFile');
}

async function isDirectory(filePath: string): Promise<boolean> {
    try {
        // stat will throw if the file does not exist
        const statRes = await stat(filePath);
        if (statRes.isDirectory()) {
            return true;
        }
    } catch {
        // file does not exist
        return false;
    }
    throw new Error('Unreachable code in isFile');
}

async function checkExtensions(
    filePathNoExt: string,
    extensions: string[],
): Promise<string | undefined> {
    for (let ext of extensions) {
        const joinedPath = filePathNoExt + ext;
        if (await isFile(joinedPath)) {
            return joinedPath;
        }
    }
    return undefined;
}
