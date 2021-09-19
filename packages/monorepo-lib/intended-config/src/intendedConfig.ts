import { Workspace } from '@yarnpkg/core';
import { ppath, npath, toFilename } from '@yarnpkg/fslib';
import { ConfigManager } from 'config-editor';
import { listInternalDevDependencies } from 'list-internal-devdependencies';
import { slash } from 'mod-slash';
import { findPackageImports } from 'find-package-imports';

export async function getIntendedConfig(rootWorkspace: Workspace) {
    const configManager = new ConfigManager();
    const childWorkspaces = rootWorkspace.getRecursiveWorkspaceChildren();

    const bootstrapBuildPackages = new Set(
        listInternalDevDependencies(rootWorkspace),
    );

    for (let childWorkspace of childWorkspaces) {
        const packageConfigEditor =
            configManager.getManagerForWorkspace(childWorkspace);

        const packageDependencies = await findPackageImports(
            npath.fromPortablePath(childWorkspace.cwd),
        );
        const childInternalDependencies = childWorkspaces.filter(
            (childWorkspace) => {
                const childName = childWorkspace.manifest.name!.name;
                return (
                    packageDependencies.devImportsSet.has(childName) ||
                    packageDependencies.devImportsSet.has(childName)
                );
            },
        );

        /**
         * Package-relative slash-path
         */
        function prsPath(otherWorspace: Workspace, fname: string) {
            return slash(
                npath.fromPortablePath(
                    ppath.join(
                        ppath.relative(childWorkspace.cwd, otherWorspace.cwd),
                        toFilename(fname),
                    ),
                ),
            );
        }

        const childToRootTsconfigJson = slash(
            npath.fromPortablePath(
                ppath.join(
                    ppath.relative(childWorkspace.cwd, rootWorkspace.cwd),
                    toFilename('tsconfig.json'),
                ),
            ),
        );

        if (bootstrapBuildPackages.has(childWorkspace)) {
            // This package needs to build with cjs/mjs/types using typescript,
            // rather than the standard esbp build which uses typescript only for types.
            packageConfigEditor.updateIntendedContents(
                ppath.join(childWorkspace.cwd, toFilename('tsconfig.json')),
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
                            path: './tsconfig.types.json',
                        },
                    ],
                },
            );

            packageConfigEditor.updateIntendedContents(
                ppath.join(childWorkspace.cwd, toFilename('tsconfig.cjs.json')),
                {
                    compilerOptions: {
                        rootDir: 'src',
                        outDir: 'lib/cjs',
                        composite: true,
                        module: 'CommonJS',
                    },
                    extends: childToRootTsconfigJson,
                    include: ['./src'],
                    exclude: ['./lib'],
                    references: [
                        ...childInternalDependencies.map(
                            (internalDependencyWorkspace) => ({
                                path: prsPath(
                                    internalDependencyWorkspace,
                                    'tsconfig.cjs.json',
                                ),
                            }),
                        ),
                        ...childInternalDependencies.map(
                            (internalDependencyWorkspace) => ({
                                path: prsPath(
                                    internalDependencyWorkspace,
                                    'tsconfig.types.json',
                                ),
                            }),
                        ),
                    ],
                },
            );

            packageConfigEditor.updateIntendedContents(
                ppath.join(childWorkspace.cwd, toFilename('tsconfig.mjs.json')),
                {
                    compilerOptions: {
                        rootDir: 'src',
                        outDir: 'lib/mjs',
                        composite: true,
                        module: 'esnext',
                    },
                    extends: childToRootTsconfigJson,
                    include: ['./src'],
                    exclude: ['./lib'],
                    references: [
                        ...childInternalDependencies.map(
                            (internalDependencyWorkspace) => ({
                                path: prsPath(
                                    internalDependencyWorkspace,
                                    'tsconfig.mjs.json',
                                ),
                            }),
                        ),
                        ...childInternalDependencies.map(
                            (internalDependencyWorkspace) => ({
                                path: prsPath(
                                    internalDependencyWorkspace,
                                    'tsconfig.types.json',
                                ),
                            }),
                        ),
                    ],
                },
            );

            packageConfigEditor.updateIntendedContents(
                ppath.join(
                    childWorkspace.cwd,
                    toFilename('tsconfig.types.json'),
                ),
                {
                    compilerOptions: {
                        rootDir: 'src',
                        outDir: 'lib/types',
                        composite: true,
                        emitDeclarationOnly: true,
                    },
                    extends: childToRootTsconfigJson,
                    include: ['./src'],
                    exclude: ['./lib'],
                    references: [
                        ...childInternalDependencies.map(
                            (internalDependencyWorkspace) => ({
                                path: prsPath(
                                    internalDependencyWorkspace,
                                    'tsconfig.types.json',
                                ),
                            }),
                        ),
                    ],
                },
            );
        } else {
            // This package needs to build types using typescript
            // but will use ebp to build all other packages
            packageConfigEditor.updateIntendedContents(
                ppath.join(childWorkspace.cwd, toFilename('tsconfig.json')),
                {
                    compilerOptions: {
                        composite: true,
                    },
                    include: [],
                    exclude: ['src', 'node_modules'],
                    references: [
                        {
                            path: './tsconfig.types.json',
                        },
                    ],
                },
            );

            packageConfigEditor.updateIntendedContents(
                ppath.join(childWorkspace.cwd, toFilename('tsconfig.json')),
                {
                    compilerOptions: {
                        rootDir: 'src',
                        outDir: 'lib/types',
                        composite: true,
                        emitDeclarationOnly: true,
                    },
                    extends: childToRootTsconfigJson,
                    include: ['./src'],
                    exclude: ['./lib'],
                    references: [
                        ...childInternalDependencies.map(
                            (internalDependencyWorkspace) => ({
                                path: prsPath(
                                    internalDependencyWorkspace,
                                    'tsconfig.types.json',
                                ),
                            }),
                        ),
                    ],
                },
            );
        }
    }
}
