import * as ts from 'typescript';
import type * as tsconfigPaths from 'tsconfig-paths';
import { normalizePath } from './normalizePath';
import path = require('path/posix');
import { matchPathPromise } from './matchPathPromise';

type ResolveResult =
    | { type: 'no-hijack'; importSpecifier: string }
    | {
          type: 'local-hijack';
          originalImportSpecifier: string;
          modPath: string;
      };

export async function resolveImportedFile(
    importerPath: string,
    importedFile: ts.FileReference,
    matchPath: tsconfigPaths.MatchPathAsync,
    allowedExtensions: string[],
): Promise<ResolveResult> {
    const importSpecifier = importedFile.fileName;
    if (importSpecifier.startsWith('.')) {
        return {
            type: 'local-hijack',
            originalImportSpecifier: importSpecifier,
            modPath: normalizePath(
                path.resolve(path.dirname(importerPath), importSpecifier),
            ),
        };
    } else {
        // non-relative path
        const matchPathResult = await matchPathPromise(
            matchPath,
            importSpecifier,
            allowedExtensions,
        );

        // if we failed to resolve, fall back to emitting the original require
        // which should fall back to importing normally from vite.
        //
        // e.g. for @vite/client
        return matchPathResult === undefined
            ? { type: 'no-hijack', importSpecifier }
            : {
                  type: 'local-hijack',
                  originalImportSpecifier: importSpecifier,
                  modPath: normalizePath(matchPathResult),
              };
    }
}
