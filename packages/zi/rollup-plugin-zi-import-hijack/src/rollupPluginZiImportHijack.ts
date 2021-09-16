import * as fs from 'fs';
import * as path from 'path';
import { Plugin } from 'rollup';
import * as tsconfigPaths from 'tsconfig-paths';
import * as ts from 'typescript';
import { getScriptFileExtensions } from './getScriptFileExtensions';
import { matchPathPromise } from './matchPathPromise';
import { slash } from 'mod-slash';

type ResolveResult =
    | { type: 'no-hijack'; importSpecifier: string }
    | {
          type: 'local-hijack';
          originalImportSpecifier: string;
          modPath: string;
      };

module.exports = function myExample(tsconfigPath = 'tsconfig.json'): Plugin {
    const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(
        tsconfigPath,
        {}, // optionsToExtend
        {
            getCurrentDirectory: process.cwd,
            fileExists: fs.existsSync,
            useCaseSensitiveFileNames: true,
            readFile: (path) => fs.readFileSync(path, 'utf-8'),
            readDirectory: () => {
                // this is supposed to be the recursive file walk.
                // since we don't care about _actually_ discovering files,
                // only about parsing the config's compilerOptions
                // (and tracking the "extends": fields across multiple files)
                // we short circuit this.
                return [];
            },
            onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
                console.error(diagnostic);
                process.exit(1);
            },
        },
    );

    return {
        name: 'my-example', // this name will show up in warnings and errors
        async transform(untransformedCode: string, id: string) {
            // hack : vite does not support getFileName(id), but does expose
            // the importing filename on the .filename property.
            //
            // This, however, is not present on Rollup.TransformPluginContext.
            const importerPath = (this as any).filename || this.getFileName(id);

            const preprocessed = ts.preProcessFile(untransformedCode);

            if (preprocessed.importedFiles.length) {
                const processedImports = await Promise.all(
                    preprocessed.importedFiles.map((importedFile) =>
                        maybeHijackResolution(
                            importerPath,
                            importedFile,
                            matchPath,
                            allowedExtensions,
                        ),
                    ),
                );

                console.log('found imports', importerPath, processedImports);

                const overwriteMap = new Map();
                for (let processedImport of processedImports) {
                    if (processedImport.type === 'local-hijack') {
                        overwriteMap.set(
                            processedImport.originalImportSpecifier,
                            processedImport.modPath,
                        );
                    }
                }
                const sourceFile =
                    ts.createUnparsedSourceFile(untransformedCode);
                transformImportsInPlace(sourceFile, overwriteMap);

                return sourceFile.getFullText();
            } else {
                return untransformedCode;
            }
        },
    };
};

function normalizePath(p: string) {
    return slash(path.relative(process.cwd(), p));
}

async function maybeHijackResolution(
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

function transformImportsInPlace(
    sourceFile: ts.SourceFile,
    importHijackPath: string,
) {
    sourceFile.chil;
}
