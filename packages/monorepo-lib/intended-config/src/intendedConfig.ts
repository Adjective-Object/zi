import {
    ppath,
    npath,
    toFilename as filename,
    PortablePath,
} from '@yarnpkg/fslib';
import { ConfigManager } from 'config-editor';
import { listInternalDevDependencies } from 'list-internal-devdependencies';
import { slash } from 'mod-slash';
import { findPackageImports } from 'find-package-imports';
import type { Workspace, Ident } from '@yarnpkg/core';
import type { PackageLike } from 'config-editor';
import { runWithConcurrentLimit } from 'run-with-concurrent-limit';

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

// TODO migrate to own package.
function kebabToCamel(kebab: string): string {
    const [firstWord, ...restWords] = kebab.split('-');
    return (
        firstWord.toLocaleLowerCase() +
        restWords.map((w) => w[0].toUpperCase() + w.substr(1)).join('')
    );
}

export type RepoMeta = {
    repoGitUrl: string;
    repoIssuesUrl: string;
    repoHomepageBaseUrl: string;
};

function pluck<T>(
    a: Record<string, T>,
    keys: string[],
): Record<string, Exclude<T, null>> {
    return Object.fromEntries(
        Object.entries(a).filter(
            ([k, v]) => keys.indexOf(k) !== -1 && v !== null,
        ) as [string, Exclude<T, null>][],
    );
}

async function setConfigContentsForPackage({
    configManager,
    packageLike,
    repoRoot,
    repoMeta: { repoGitUrl, repoIssuesUrl, repoHomepageBaseUrl },
    packageAuthor,
    internalPackages,
    bootstrapBuildPackageIdents,
    extraScripts,
    permittedPackageVersions,
}: {
    configManager: ConfigManager;
    packageLike: PackageLike;
    repoRoot: PortablePath;
    repoMeta: RepoMeta;
    extraScripts: Record<string, string>;
    permittedPackageVersions: Record<string, string>;
    packageAuthor: string;
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
                packageDependencies.programImportsSet.has(
                    internalPackage.manifest.name.name,
                )
            );
        },
    );
    const isExternalPackageName = (packageName: string) =>
        !internalPackages.some((p) => p.manifest.name.name === packageName);
    const externalDevDependencies = [
        ...packageDependencies.devImportsSet,
    ].filter(isExternalPackageName);
    const externalDependencies = [
        ...packageDependencies.programImportsSet,
    ].filter(isExternalPackageName);

    const missingExternalPackages = [
        ...externalDependencies,
        ...externalDevDependencies,
    ].filter(
        (externalDependency) =>
            !permittedPackageVersions.hasOwnProperty(externalDependency),
    );
    if (missingExternalPackages.length) {
        throw new Error(
            `preferred packages map was missing external dependencies: ${missingExternalPackages}`,
        );
    }

    /**
     * Package-relative slash-path
     */
    function prsPath(otherWorspace: PackageLike, fname: string) {
        return slash(
            ppath.join(
                ppath.relative(packageLike.cwd, otherWorspace.cwd),
                filename(fname),
            ),
        );
    }

    const childToRootTsconfigJson = slash(
        ppath.join(
            ppath.relative(packageLike.cwd, repoRoot),
            filename('tsconfig.json'),
        ),
    );

    const packageJsonPPath = ppath.join(
        packageLike.cwd,
        filename('package.json'),
    );
    packageConfigEditor.updateIntendedContents(packageJsonPPath, {
        name: packageLike.manifest.name.name,
        version: '0.0.0',
        author: packageAuthor,
        homepage:
            repoHomepageBaseUrl +
            slash(
                npath.fromPortablePath(
                    ppath.relative(repoRoot, packageLike.cwd),
                ),
            ),
        license: 'UNLICENSED',
        main: `lib/cjs/${kebabToCamel(packageLike.manifest.name.name)}.js`,
        module: `lib/mjs/${kebabToCamel(packageLike.manifest.name.name)}.js`,
        types: `lib/types/${kebabToCamel(packageLike.manifest.name.name)}.d.ts`,
        input: `src/${kebabToCamel(packageLike.manifest.name.name)}.ts`,
        scripts: {
            test: 'echo "Error: run tests from root" && exit 1',
            ...extraScripts,
        },
        directories: {
            lib: 'lib',
        },
        files: ['lib'],
        repository: {
            type: 'git',
            url: repoGitUrl,
        },
        bugs: {
            url: repoIssuesUrl,
        },
        dependencies: pluck(permittedPackageVersions, externalDependencies),
        // TODO probably better to error if we error on missing verisons
        devDependencies: {
            ...pluck(permittedPackageVersions, [
                ...externalDevDependencies,
                '@types/node',
                'eslint',
                'prettier',
                'typescript',
                'npm-run-all',
            ]),
        },
    });

    if (bootstrapBuildPackageIdents.has(packageLike.manifest.name.identHash)) {
        // This package needs to build with cjs/mjs/types using typescript,
        // rather than the standard esbp build which uses typescript only for types.

        // these updates will merge with the base config we push earlier
        packageConfigEditor.updateIntendedContents(packageJsonPPath, {
            scripts: {
                build: 'tsc -b ./tsconfig.json',
                'build:types': 'tsc -b ./tsconfig.types.json',
                'build:scripts': 'npm-run-all build:cjs build:mjs',
                'build:cjs': 'tsc -b ./tsconfig.cjs.json',
                'build:mjs': 'tsc -b ./tsconfig.mjs.json',
            },
        });

        packageConfigEditor.updateIntendedContents(
            ppath.join(packageLike.cwd, filename('tsconfig.json')),
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
            ppath.join(packageLike.cwd, filename('tsconfig.cjs.json')),
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
            ppath.join(packageLike.cwd, filename('tsconfig.mjs.json')),
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
            ppath.join(packageLike.cwd, filename('tsconfig.types.json')),
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
        // This package needs to build types using typescript.
        // We will use esbp to build the concrete script outputs.

        // these updates will merge with the base config we push earlier
        packageConfigEditor.updateIntendedContents(packageJsonPPath, {
            scripts: {
                build: 'npm-run-all -p build:types build:scripts',
                'build:types': 'tsc -b ./tsconfig.json',
                'build:scripts': 'esbp',
                'build:cjs': 'esbp --cjs-only',
                'build:mjs': 'esbp --mjs-only',
            },
            devDependencies: {
                esbp: 'workspace:*',
                ...pluck(permittedPackageVersions, ['npm-run-all']),
            },
        });

        packageConfigEditor.updateIntendedContents(
            ppath.join(packageLike.cwd, filename('tsconfig.json')),
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
                references: [],
            },
        );
    }
}

export async function getIntendedConfigsForChildWorkspaces(
    configManager: ConfigManager,
    rootWorkspace: Workspace,
    options: {
        extraScripts?: Record<string, string>;
        permittedPackageVersions?: Record<string, string | null>;
        repoMeta: {
            repoHomepageBaseUrl: string;
            repoIssuesUrl: string;
            repoGitUrl: string;
        };
        packageAuthor: string;
    },
) {
    const childWorkspaces = rootWorkspace.getRecursiveWorkspaceChildren();

    const bootstrapBuildPackages = new Set(
        listInternalDevDependencies(rootWorkspace),
    );

    await runWithConcurrentLimit(
        10,
        childWorkspaces,
        (childWorkspace: Workspace) => {
            return setConfigContentsForPackage({
                configManager: configManager,
                packageLike: {
                    cwd: childWorkspace.cwd,
                    manifest: {
                        name: assertHasNamedManifest(childWorkspace).manifest
                            .name,
                    },
                },
                repoRoot: rootWorkspace.cwd,
                repoMeta: options.repoMeta,
                packageAuthor: options.packageAuthor,
                extraScripts: options?.extraScripts ?? {},
                permittedPackageVersions:
                    options?.permittedPackageVersions ?? {},
                internalPackages: childWorkspaces.map(assertHasNamedManifest),
                bootstrapBuildPackageIdents: new Set(
                    [...bootstrapBuildPackages].map(
                        (x) =>
                            assertHasNamedManifest(x).manifest.name.identHash,
                    ),
                ),
            });
        },
    );

    return configManager;
}
