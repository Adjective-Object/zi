import 'colors';
import { promise as glob } from 'glob-promise';
import { readFile as readFileCb } from 'fs';
import { promisify } from 'util';
import * as path from 'path';
import {
    createSourceFile,
    isCallExpression,
    isIdentifier,
    isImportDeclaration,
    Node as TsNode,
    ScriptTarget,
} from 'typescript';
const readFile = promisify(readFileCb);

function simplifyModuleSpecifier(moduleSpecifier: string): string | null {
    if (moduleSpecifier.startsWith('.')) {
        return null;
    }
    return moduleSpecifier.startsWith('@')
        ? moduleSpecifier.split('/').slice(0, 2).join('/')
        : moduleSpecifier.split('/')[0];
}

function recursiveFindImports(resultSet: Set<string>, tsNode: TsNode) {
    if (isImportDeclaration(tsNode)) {
        const fullModuleSpecifierLiteralText =
            tsNode.moduleSpecifier.getFullText();
        const simplifiedModuleSpecifier = simplifyModuleSpecifier(
            fullModuleSpecifierLiteralText.slice(
                2,
                fullModuleSpecifierLiteralText.length - 1,
            ),
        );
        if (simplifiedModuleSpecifier) {
            resultSet.add(simplifiedModuleSpecifier);
        }
    } else if (isCallExpression(tsNode)) {
        // check for 'describe' or 'it' calls to detect dependency on @types/jest
        if (isIdentifier(tsNode.expression)) {
            if (
                tsNode.expression.escapedText === 'describe' ||
                tsNode.expression.escapedText === 'it'
            ) {
                resultSet.add('@types/jest');
            }
        }
    }
    tsNode.forEachChild(recursiveFindImports.bind(null, resultSet));
}

type DiscoveredImports = {
    programImportsSet: Set<string>;
    devImportsSet: Set<string>;
};

/**
 * Scans package sources and tries to find imported packages by name
 * @param packageDir path to the directory to scan
 * @returns the set of discovered dev / program dependencies
 */
export async function findPackageImports(
    packageDir: string,
): Promise<DiscoveredImports> {
    const scriptFiles = await (
        await glob('src/**/*.+(ts|tsx|js|jsx)', { cwd: packageDir })
    ).map((file) => path.join(packageDir, file));
    const programImportsSet = new Set<string>();
    const devImportsSet = new Set<string>(['typescript', 'eslint', 'prettier']);

    await Promise.all(
        scriptFiles.map(async (scriptFile: string) => {
            let fileContent;
            try {
                fileContent = await readFile(scriptFile);
            } catch (e) {
                throw new Error(`Error while reading file ${scriptFile}: ${e}`);
            }
            const sourceFile = await createSourceFile(
                path.basename(scriptFile),
                fileContent.toString(),
                ScriptTarget.ES2015,
                /*setParentNodes */ true,
            );

            if (
                scriptFile.includes('__test__') ||
                scriptFile.includes('__tests__')
            ) {
                recursiveFindImports(devImportsSet, sourceFile);
            } else {
                recursiveFindImports(programImportsSet, sourceFile);
            }
        }),
    );

    return { programImportsSet, devImportsSet };
}
