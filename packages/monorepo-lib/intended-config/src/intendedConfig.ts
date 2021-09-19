import { ppath, npath, toFilename as toFl, PortablePath } from '@yarnpkg/fslib';
import { ConfigManager } from 'config-editor';
import { listInternalDevDependencies } from 'list-internal-devdependencies';
import { slash } from 'mod-slash';
import { findPackageImports } from 'find-package-imports';
import type { Workspace, Ident } from '@yarnpkg/core';
import type { PackageLike } from 'config-editor';

type NamedWorkspace = Workspace & {
    manifest: {
        name: Ident;
    };
};

function assertHasNamedManifest(w: Workspace): NamedWorkspace {
    if (w.manifest.name === null) {
        throw new Error(
            `Found workspace manifest with no name at ${npath.fromPortablePath(
                w.cwd,
            )}`,
        );
    }
    return w as NamedWorkspace;
}

async function setConfigContentsForPackage({
    configManager,
    packageLike,
    repoRoot,
    internalPackages,
    bootstrapBuildPackageIdents,
}: {
    configManager: ConfigManager;
    packageLike: PackageLike;
    repoRoot: PortablePath;
    internalPackages: PackageLike[];
    bootstrapBuildPackageIdents: Set<string>;
}) {
    const packageConfigEditor =
        configManager.getManagerForPackageLike(packageLike);

    const packageDependencies = await findPackageImports(
        npath.fromPortablePath(packageLike.cwd),
    );
    const childInternalDependencies = internalPackages.filter(
        (internalPackage) => {
            return (
                packageDependencies.devImportsSet.has(
                    internalPackage.manifest.name.name,
                ) ||
                packageDependencies.devImportsSet.has(
                    internalPackage.manifest.name.name,
                )
            );
        },
    );

    /**
     * Package-relative slash-path
     */
    function prsPath(otherWorspace: PackageLike, fname: string) {
        return slash(
            ppath.join(
                ppath.relative(packageLike.cwd, otherWorspace.cwd),
                toFl(fname),
            ),
        );
    }

    const childToRootTsconfigJson = slash(
        ppath.join(
            ppath.relative(packageLike.cwd, repoRoot),
            toFl('tsconfig.json'),
        ),
    );

    if (bootstrapBuildPackageIdents.has(packageLike.manifest.name.identHash)) {
        // This package needs to build with cjs/mjs/types using typescript,
        // rather than the standard esbp build which uses typescript only for types.
        packageConfigEditor.updateIntendedContents(
            ppath.join(packageLike.cwd, toFl('tsconfig.json')),
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
            ppath.join(packageLike.cwd, toFl('tsconfig.cjs.json')),
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
            ppath.join(packageLike.cwd, toFl('tsconfig.mjs.json')),
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
            ppath.join(packageLike.cwd, toFl('tsconfig.types.json')),
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
            ppath.join(packageLike.cwd, toFl('tsconfig.json')),
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
            ppath.join(packageLike.cwd, toFl('tsconfig.json')),
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

export async function getIntendedConfig(rootWorkspace: Workspace) {
    const configManager = new ConfigManager();
    const childWorkspaces = rootWorkspace.getRecursiveWorkspaceChildren();

    const bootstrapBuildPackages = new Set(
        listInternalDevDependencies(rootWorkspace),
    );

    await Promise.all(
        childWorkspaces.map((childWorkspace) => {
            assertHasNamedManifest(childWorkspace);
            return setConfigContentsForPackage({
                configManager: configManager,
                packageLike: {
                    cwd: childWorkspace.cwd,
                    manifest: {
                        name: childWorkspace.manifest.name,
                    },
                },
                repoRoot: rootWorkspace.cwd,
                internalPackages: childWorkspaces.map(assertHasNamedManifest),
                bootstrapBuildPackageIdents: new Set(
                    [...bootstrapBuildPackages].map((x) => {
                        assertHasNamedManifest(x).manifest.name.identHash;
                    }),
                ),
            });
        }),
    );
}
