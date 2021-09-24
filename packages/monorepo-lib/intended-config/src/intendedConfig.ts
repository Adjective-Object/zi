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

async function setConfigContentsForPackage({
    configManager,
    packageLike,
    repoRoot,
    repoMeta: { repoGitUrl, repoIssuesUrl, repoHomepageBaseUrl },
    packageAuthor,
    internalPackages,
    bootstrapBuildPackageIdents,
    extraScripts,
}: {
    configManager: ConfigManager;
    packageLike: PackageLike;
    repoRoot: PortablePath;
    repoMeta: RepoMeta;
    extraScripts: Record<string, string>;
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

    const basePackageJson = {
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
        directories: {
            lib: 'lib',
        },
        files: ['lib'],
        repository: {
            type: 'git',
            url: repoGitUrl,
        },
        scripts: {
            test: 'echo "Error: run tests from root" && exit 1',
        },
        bugs: {
            url: repoIssuesUrl,
        },
        devDependencies: {
            '@types/node': '^14.14.45',
            eslint: '^7.26.0',
            prettier: '^2.3.0',
            typescript: '^4.2.4',
            'npm-run-all': '^4.1.5',
        },
    };

    if (bootstrapBuildPackageIdents.has(packageLike.manifest.name.identHash)) {
        // This package needs to build with cjs/mjs/types using typescript,
        // rather than the standard esbp build which uses typescript only for types.

        packageConfigEditor.updateIntendedContents(
            ppath.join(packageLike.cwd, filename('package.json')),
            {
                ...basePackageJson,
                scripts: {
                    ...extraScripts,
                    build: 'tsc -b ./tsconfig.json',
                    'build:types': 'tsc -b ./tsconfig.types.json',
                    'build:scripts': 'npm-run-all build:cjs build:mjs',
                    'build:cjs': 'tsc -b ./tsconfig.cjs.json',
                    'build:mjs': 'tsc -b ./tsconfig.mjs.json',
                },
            },
        );

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

        packageConfigEditor.updateIntendedContents(
            ppath.join(packageLike.cwd, filename('package.json')),
            {
                ...basePackageJson,
                scripts: {
                    ...extraScripts,
                    build: 'npm-run-all -p build:types build:scripts',
                    'build:types': 'tsc -b ./tsconfig.json',
                    'build:scripts': 'esbp',
                    'build:cjs': 'esbp --cjs-only',
                    'build:mjs': 'esbp --mjs-only',
                },
                devDependencies: {
                    ...basePackageJson.devDependencies,
                    esbp: 'workspace:*',
                    esbuild: '^0.12.28',
                },
            },
        );

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
    extraScripts: Record<string, string> = {},
) {
    const childWorkspaces = rootWorkspace.getRecursiveWorkspaceChildren();

    const bootstrapBuildPackages = new Set(
        listInternalDevDependencies(rootWorkspace),
    );

    await runWithConcurrentLimit(10, childWorkspaces, (childWorkspace) => {
        return setConfigContentsForPackage({
            configManager: configManager,
            packageLike: {
                cwd: childWorkspace.cwd,
                manifest: {
                    name: assertHasNamedManifest(childWorkspace).manifest.name,
                },
            },
            repoRoot: rootWorkspace.cwd,
            repoMeta: {
                repoHomepageBaseUrl:
                    'https://github.com/Adjective-Object/draftsim/tree/master/packages/',
                repoIssuesUrl:
                    'https://github.com/Adjective-Object/draftsim/issues',
                repoGitUrl: 'git@github.com:Adjective-Object/draftsim.git',
            },
            packageAuthor: 'Maxwell Huang-Hobbs <mhuan13@gmail.com>',
            extraScripts,
            internalPackages: childWorkspaces.map(assertHasNamedManifest),
            bootstrapBuildPackageIdents: new Set(
                [...bootstrapBuildPackages].map(
                    (x) => assertHasNamedManifest(x).manifest.name.identHash,
                ),
            ),
        });
    });

    return configManager;
}
