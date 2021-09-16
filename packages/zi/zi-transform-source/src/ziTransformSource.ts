import * as fs from 'fs';
import * as tsconfigPaths from 'tsconfig-paths';
import * as ts from 'typescript';
import { getScriptFileExtensions } from './getScriptFileExtensions';
import { resolveImportedFile } from './resolveImportedFile';
import { transformImports } from './transformImports';

export class ZiTransformer {
    private matchPath: tsconfigPaths.MatchPathAsync;
    private allowedExtensions: string[];

    constructor(tsconfigPath: string) {
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

        this.matchPath = tsconfigPaths.createMatchPathAsync(
            parsedCommandLine.options.baseUrl,
            parsedCommandLine.options.paths || {},
        );

        this.allowedExtensions = getScriptFileExtensions({
            allowJs: parsedCommandLine.options.allowJs,
            jsx: parsedCommandLine.options.jsx !== ts.JsxEmit.None,
            includeJson: parsedCommandLine.options.resolveJsonModule,
            // we only want to resolve hard files (since this is for use in vite)
            includeDefinitions: false,
        });
    }

    async transformSource(
        importerPath: string,
        sourceString: string,
    ): Promise<string> {
        const preprocessed = ts.preProcessFile(sourceString);

        if (preprocessed.importedFiles.length) {
            const resolvedImports = await Promise.all(
                preprocessed.importedFiles.map((importedFile) =>
                    resolveImportedFile(
                        importerPath,
                        importedFile,
                        this.matchPath,
                        this.allowedExtensions,
                    ),
                ),
            );

            const overwriteMap = new Map();
            for (let resolvedImport of resolvedImports) {
                if (resolvedImport.type === 'local-hijack') {
                    overwriteMap.set(
                        resolvedImport.originalImportSpecifier,
                        resolvedImport.modPath,
                    );
                }
            }
            return transformImports(sourceString, overwriteMap);
        } else {
            return sourceString;
        }
    }
}
