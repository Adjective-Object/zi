import 'colors';
import { Workspace } from '@yarnpkg/core';
import builtinModules from 'builtin-modules';
import { asyncSpawn } from 'async-spawn';
import * as CommentJson from 'comment-json';
import * as Diff from 'diff';
import { promise as glob } from 'glob-promise';
import {
    readFile as readFileCb,
    writeFile as writeFileCb,
    exists as existsCb,
} from 'fs';
import { promisify } from 'util';
import * as path from 'path';
import {
    CompilerOptions,
    createSourceFile,
    isCallExpression,
    isIdentifier,
    isImportDeclaration,
    Node as TsNode,
    ScriptTarget,
} from 'typescript';
import { slash } from 'mod-slash';
import { listInternalDevDependencies } from 'list-internal-devdependencies';
import { getRepoRootWorkspace } from 'get-repo-root';
import { npath } from '@yarnpkg/fslib';

const readFile = promisify(readFileCb);
const writeFile = promisify(writeFileCb);
const exists = promisify(existsCb);

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

async function findPackageImportSpecifiers(
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

/**
 * Returns the map of package name to package path
 * @returns
 */
async function findInternalPackageNames(
    packageJsonPaths: string[],
): Promise<Map<string, string>> {
    return new Map<string, string>(
        await Promise.all(
            packageJsonPaths.map(
                async (packageJsonPath: string): Promise<[string, string]> => {
                    const parsedPackageJson = JSON.parse(
                        await readFile(packageJsonPath, 'utf-8'),
                    );
                    const packageDirname = path.dirname(packageJsonPath);
                    const packageBasename = path.basename(packageDirname);
                    if (!parsedPackageJson.name) {
                        console.warn(
                            `package at path ${packageJsonPath} had no name. Using ${packageBasename}`
                                .yellow,
                        );
                        return [packageBasename, packageDirname];
                    } else {
                        if (!parsedPackageJson.name.includes(packageBasename)) {
                            console.warn(
                                `package at path ${packageJsonPath} had name ${parsedPackageJson.name} which did not contain its dirname ${packageBasename}`
                                    .yellow,
                            );
                        }
                        return [parsedPackageJson.name, packageDirname];
                    }
                },
            ),
        ),
    );
}

async function findOrPatchReferences(
    repoDir: string,
    packageDir: string,
    tsconfigPath: string,
    intendedReferenceArr: { path: string }[],
    intendedCompilerOptions: Record<keyof CompilerOptions, any>,
) {
    // write a new tsconfig or patch onto the old one
    const rootExtend = slash(
        path.relative(packageDir, path.join(repoDir, 'tsconfig.json')),
    );
    if (!(await exists(tsconfigPath))) {
        console.log(`path ${tsconfigPath} does not exist. Creating.`);
        await writeFile(
            tsconfigPath,
            JSON.stringify(
                {
                    compilerOptions: {
                        outDir: 'lib',
                        strict: true,
                        ...intendedCompilerOptions,
                    },
                    extends: rootExtend,
                    includes: ['./src'],
                    references: intendedReferenceArr,
                },
                null,
                4,
            ),
        );
    } else {
        const parsedTsconfigJson = await readFile(tsconfigPath, 'utf-8')
            .then(CommentJson.parse)
            .catch((e) => {
                console.error(`error reading/parsing "${tsconfigPath}"`.red);
                console.error(e);
            });

        if (!parsedTsconfigJson) {
            return;
        }

        const intendedString = JSON.stringify(intendedReferenceArr, null, 4);
        const oldRefAsString = CommentJson.stringify(
            parsedTsconfigJson.references,
            null,
            4,
        );
        let hasMismatch = false;
        if (parsedTsconfigJson.extends !== rootExtend) {
            console.log(`found 'extends' mismatch in ${tsconfigPath}:`);
            parsedTsconfigJson.extends = rootExtend;
            hasMismatch = true;
        }
        if (oldRefAsString !== intendedString) {
            console.log(`found references mismatch in ${tsconfigPath}:`);
            const diff = Diff.diffLines(oldRefAsString || '', intendedString);

            diff.forEach((part: Diff.Change) => {
                // green for additions, red for deletions
                // grey for common parts
                const color = part.added
                    ? 'green'
                    : part.removed
                    ? 'red'
                    : 'grey';
                process.stderr.write(part.value[color]);
            });
            console.log();

            parsedTsconfigJson.references = intendedReferenceArr;
            for (let [k, v] of Object.entries(intendedCompilerOptions)) {
                if (
                    !(k in parsedTsconfigJson.compilerOptions) ||
                    // TODO deep compare objects
                    parsedTsconfigJson.compilerOptions[k] !== v
                ) {
                    parsedTsconfigJson.compilerOptions[k] = v;
                }
            }
            hasMismatch = true;
        }
        await writeFile(
            tsconfigPath,
            CommentJson.stringify(parsedTsconfigJson, null, 4),
        );
    }
}

async function updateTsconfigJsonReferences(
    repoDir: string,
    rootYarnWorkspace: Workspace,
    internalDevDependencies: Set<Workspace>,
    packageDir: string,
    internalPackagePathMap: Map<string, string>,
    importSpecifiers: Set<string>,
) {
    // intended tsconfig json
    const intendedReferences = [...importSpecifiers].filter((ref) =>
        internalPackagePathMap.has(ref),
    );

    // TODO consider mismatches between package directories and names
    const intendedReferenceArr = (tsconfigName: string) =>
        intendedReferences.sort().map((refName) => ({
            path: slash(
                path.relative(
                    packageDir,
                    path.join(
                        internalPackagePathMap.get(refName)!,
                        tsconfigName,
                    ),
                ),
            ),
        }));

    // if this is on the list of internal dev dependencies, then it will be built
    // to cjs and mjs as part of repo bootstrap -- that means it has to build
    // using typescript, rather than using esbp
    if (
        internalDevDependencies.has(
            rootYarnWorkspace.project.getWorkspaceByFilePath(
                npath.toPortablePath(packageDir),
            ),
        )
    ) {
        console.log(`templating ${packageDir} as an internal dev package`);
        await Promise.all([
            findOrPatchReferences(
                repoDir,
                packageDir,
                path.join(packageDir, 'tsconfig.cjs.json'),
                intendedReferenceArr('tsconfig.cjs.json'),
                {
                    outDir: 'lib/cjs',
                    module: 'CommonJs',
                },
            ),
            findOrPatchReferences(
                repoDir,
                packageDir,
                path.join(packageDir, 'tsconfig.mjs.json'),
                intendedReferenceArr('tsconfig.mjs.json'),
                {
                    outDir: 'lib/mjs',
                    module: 'esnext',
                },
            ),
            findOrPatchReferences(
                repoDir,
                packageDir,
                path.join(packageDir, 'tsconfig.types.json'),
                intendedReferenceArr('tsconfig.types.json'),
                {
                    outDir: 'lib/types',
                    emitDeclarationOnly: true,
                },
            ),
            writeFile(
                path.join(packageDir, 'tsconfig.json'),
                JSON.stringify(
                    {
                        compilerOptions: {
                            composite: true,
                        },
                        include: [],
                        exclude: ['src', 'node_modules'],
                        references: [
                            {
                                path: './tsconfig.cjs.json',
                            },
                            {
                                path: './tsconfig.mjs.json',
                            },
                            {
                                path: './tsconfig.mjs.json',
                            },
                        ],
                    },
                    null,
                    4,
                ),
            ),
        ]);
    } else {
        console.log(`templating ${packageDir} as a non-dev package`);

        await findOrPatchReferences(
            repoDir,
            packageDir,
            path.join(packageDir, 'tsconfig.json'),
            intendedReferenceArr('tsconfig.json'),
            {
                outDir: 'lib/types',
            },
        );
    }
}

const YARN = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';

/**
 *
 * @param packageDir
 * @param internalPackageNameMap
 * @param importSpecifiers
 * @returns if we need to run yarn at the root level to finish the workspace after updates.
 */
async function updatePackageJsonReferences(
    packageDir: string,
    internalPackageNameMap: Map<string, string>,
    importSpecifiers: DiscoveredImports,
): Promise<boolean> {
    const packageJsonPath = path.join(packageDir, 'package.json');
    const internalReferences = [
        ...importSpecifiers.programImportsSet,
        ...importSpecifiers.devImportsSet,
    ].filter((ref) => internalPackageNameMap.has(ref));
    const externalReferences = [
        ...importSpecifiers.programImportsSet,
        ...importSpecifiers.devImportsSet,
    ].filter((ref) => !internalPackageNameMap.has(ref));

    const packageJsonContent = JSON.parse(
        await readFile(packageJsonPath, 'utf-8'),
    );

    let needsUpdate = false;
    for (const internalReference of internalReferences) {
        if (importSpecifiers.programImportsSet.has(internalReference)) {
            if (
                !Object.hasOwnProperty.call(
                    packageJsonContent.dependencies || {},
                    internalReference,
                )
            ) {
                console.log(
                    'updating',
                    packageJsonContent.name,
                    'dependencies to add missing reference',
                    internalReference,
                );
                if (!packageJsonContent.dependencies) {
                    packageJsonContent.dependencies = {};
                }
                packageJsonContent.dependencies[internalReference] =
                    'workspace:*';
                needsUpdate = true;
            }
        } else if (importSpecifiers.devImportsSet.has(internalReference)) {
            if (
                !Object.hasOwnProperty.call(
                    packageJsonContent.devDependencies || {},
                    internalReference,
                )
            ) {
                if (!packageJsonContent.dependencies) {
                    packageJsonContent.dependencies = {};
                }

                packageJsonContent.devDependencies[internalReference] =
                    'workspace:*';
                needsUpdate = true;
            }
        }
    }

    for (const depName in packageJsonContent.dependencies) {
        if (
            packageJsonContent.dependencies[depName].startsWith('workspace') &&
            !internalReferences.includes(depName)
        ) {
            console.log(
                'updating',
                packageJsonContent.name,
                'to remove dangling reference to',
                depName,
            );

            delete packageJsonContent.dependencies[depName];
            needsUpdate = true;
        }
    }

    const missingNpmInstalls = new Set<string>();
    const missingDevNpmInstalls = new Set<string>();
    for (const externalReference of externalReferences) {
        if (
            !Object.hasOwnProperty.call(
                packageJsonContent.dependencies || {},
                externalReference,
            ) &&
            !Object.hasOwnProperty.call(
                packageJsonContent.devDependencies || {},
                externalReference,
            ) &&
            !builtinModules.includes(externalReference)
        ) {
            if (importSpecifiers.programImportsSet.has(externalReference)) {
                missingNpmInstalls.add(externalReference);
                if (!externalReference.startsWith('@types')) {
                    missingDevNpmInstalls.add('@types/' + externalReference);
                }
            } else {
                missingDevNpmInstalls.add(externalReference);
            }
        }
    }

    const allImports = new Set([
        ...(packageJsonContent.dependencies
            ? Object.keys(packageJsonContent.dependencies)
            : []),
        ...(packageJsonContent.devDependencies
            ? Object.keys(packageJsonContent.devDependencies)
            : []),
    ]);
    const extraImports = new Set(allImports);
    for (let actualImport of [
        ...importSpecifiers.programImportsSet,
        ...importSpecifiers.devImportsSet,
    ]) {
        extraImports.delete(actualImport);
        extraImports.delete('@types/' + actualImport);
    }
    extraImports.delete('@types/node');
    if (extraImports.size) {
        console.warn(
            `${packageJsonPath} has unimported ${
                extraImports.size > 1 ? 'dependencies' : 'dependency'
            } [\n  ${Array.from(extraImports).join(
                '\n  ',
            )}\n]\nThese may be used in scripts / peer dependencies`.yellow,
        );
    }

    if (missingNpmInstalls.size) {
        console.log('spawning yarn in', packageDir, 'to install', [
            ...missingNpmInstalls,
        ]);
        await asyncSpawn(YARN, ['add', ...missingNpmInstalls], {
            cwd: packageDir,
            stdio: 'inherit',
        });
    }

    if (missingDevNpmInstalls.size) {
        console.log(
            'spawning yarn in',
            packageDir,
            'to install',
            [...missingDevNpmInstalls],
            'as a dev dependency',
        );
        await asyncSpawn(YARN, ['add', '--dev', ...missingDevNpmInstalls], {
            cwd: packageDir,
            stdio: 'inherit',
        });
    }

    if (needsUpdate) {
        console.log('writing updated package.json to', packageJsonPath);
        await writeFile(
            packageJsonPath,
            JSON.stringify(packageJsonContent, null, 4),
        );
    }

    return needsUpdate;
}

async function main() {
    const repoRootDir = path.resolve(__dirname, '..', '..', '..', '..', '..');
    const packagesDir = path.join(repoRootDir, 'packages');
    const packageJsonPaths = (
        await glob('**/package.json', {
            cwd: packagesDir,
            ignore: '**/node_modules/**',
        })
    ).map((file) => path.join(packagesDir, file));

    const internalPackageNameMap = await findInternalPackageNames(
        packageJsonPaths,
    );

    let needsGlobalInstall = false;
    // running these yarn installs in parallel isn't stable
    for (let packagePath of packageJsonPaths) {
        const packageDir = path.dirname(packagePath);

        const importSpecifiers = await findPackageImportSpecifiers(packageDir);

        const parsedPackageJson = JSON.parse(
            await readFile(path.join(packageDir, 'package.json'), 'utf-8'),
        );

        if (
            importSpecifiers.programImportsSet.has(parsedPackageJson.name) ||
            importSpecifiers.devImportsSet.has(parsedPackageJson.name)
        ) {
            console.log(
                `package "${parsedPackageJson.name}" references itself by external import name.\n` +
                    '  This introduces cycles to the tsconfig project graph.\n' +
                    '  Packages should use relative paths internally.',
            );
            importSpecifiers.programImportsSet.delete(parsedPackageJson.name);
            importSpecifiers.devImportsSet.delete(parsedPackageJson.name);
        }

        const rootYarnWorkspace = await getRepoRootWorkspace();
        const internalDevDependencies = new Set(
            listInternalDevDependencies(rootYarnWorkspace),
        );

        await Promise.all([
            updateTsconfigJsonReferences(
                repoRootDir,
                rootYarnWorkspace,
                internalDevDependencies,
                packageDir,
                internalPackageNameMap,
                new Set([
                    ...importSpecifiers.programImportsSet,
                    ...importSpecifiers.devImportsSet,
                ]),
            ),
            updatePackageJsonReferences(
                packageDir,
                internalPackageNameMap,
                importSpecifiers,
            ).then((needsUpdate) => {
                needsGlobalInstall = needsGlobalInstall || needsUpdate;
            }),
        ]);
    }

    if (needsGlobalInstall) {
        console.log('running yarn in whole workspace after updates');
        await asyncSpawn(YARN, {
            cwd: path.resolve(__dirname, '..', '..', '..'),
            stdio: 'inherit',
        });
    }

    console.log('fixrefs complete');
}

main().catch((e) => {
    console.log('exiting due to error:');
    console.error(e);
    process.exit(1);
});
