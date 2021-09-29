import commander from 'commander';
import { IdentHash, Project, Workspace } from '@yarnpkg/core';
import {
    ppath,
    toFilename,
    Stats,
    NodeFS,
    PortablePath,
    npath,
} from '@yarnpkg/fslib';
import { asyncSpawn } from 'async-spawn';
import { getRepoRootWorkspace } from 'get-repo-root';
import { collectAllExternalDependencies } from 'collect-external-dependencies';
import { setConfigContentsForPackage } from 'intended-config';
import { ConfigManager, Change, PackageLike } from 'config-editor';
import { nanoid } from 'nanoid';
import { runWithConcurrentLimit } from 'run-with-concurrent-limit';
import mkdirp from 'mkdirp';

async function bootstrapPackage(
    repoRootWorkspace: Workspace,
    allowedExternalDependenices: Record<string, string>,
    packageSpecifierStr: string,
) {
    const configManager = new ConfigManager();
    const packageSpecifier = ppath.join(
        ...packageSpecifierStr.split(ppath.sep).map(toFilename),
    );
    const packageDestinationDirectory = ppath.join(
        repoRootWorkspace.project.topLevelWorkspace.cwd,
        toFilename('packages'),
        npath.toPortablePath(packageSpecifier),
    );
    const intendedPackageName = ppath.basename(packageSpecifier);

    console.log('creating new package', intendedPackageName);

    const children =
        repoRootWorkspace.project.topLevelWorkspace.getRecursiveWorkspaceChildren();
    for (let child of children) {
        if (child.manifest.name?.name === intendedPackageName) {
            console.error(
                `Workspace already has a package named ${intendedPackageName} at path ${child.cwd}`,
            );
            return 1;
        }
    }

    // Create a fake package that we can use to ask the intended
    // config generator what it wants
    const packageLike: PackageLike = {
        manifest: {
            name: {
                name: intendedPackageName,
                identHash: nanoid() as IdentHash,
            },
        },
        cwd: ppath.resolve(packageDestinationDirectory),
    };

    // generate the configs
    console.log('Generating intended configs');
    await setConfigContentsForPackage({
        configManager,
        packageLike,
        repoRoot: repoRootWorkspace.cwd,
        repoMeta: {
            repoHomepageBaseUrl:
                'https://github.com/Adjective-Object/zi/tree/master/packages/',
            repoIssuesUrl: 'https://github.com/Adjective-Object/zi/issues',
            repoGitUrl: 'git@github.com:Adjective-Object/zi.git',
        },
        packageAuthor: 'Maxwell Huang-Hobbs <mhuan13@gmail.com>',
        internalPackages: repoRootWorkspace.getRecursiveWorkspaceChildren(),
        // TODO update this once I un-break esbp builds
        isBootstrapBuildPackage: true,
        extraScripts: {},
        permittedPackageVersions: allowedExternalDependenices,
    });

    // write the intended configs
    console.log('Writing configs');
    const changeset = await configManager.generateChangeset();
    await runWithConcurrentLimit(10, changeset, (c) => {
        console.log('writing', c.getPath());
        return c.write();
    });

    // generate the source file
    const generatedPackageJson = configManager
        .getManagerForPackageLike(packageLike)
        .getIntendedContents(
            ppath.join(packageLike.cwd, npath.toPortablePath('package.json')),
        );
    // get the output path or a fallback
    const entrypointScriptPath =
        ppath.join(
            packageLike.cwd,
            toFilename('src'),
            generatedPackageJson?.input,
        ) ||
        ppath.join(packageLike.cwd, toFilename('src'), toFilename('index.js'));
    console.log(`Writing source entrypoint to ${entrypointScriptPath}`);
    const fs = new NodeFS();
    await mkdirp(npath.fromPortablePath(ppath.dirname(entrypointScriptPath)));
    await fs.writeFilePromise(entrypointScriptPath, 'export {}\n');

    console.log(
        'finished creating package at',
        ppath.relative(ppath.cwd(), packageLike.cwd),
    );

    return 0;
}

async function main(): Promise<number> {
    const packageVersion = require('../../package.json').version || 'pre-alpha';
    const program = commander.program
        .version(packageVersion)
        .usage('[options] <packageName>');
    program.parse(process.argv);

    // check for an existing workspace
    const repoRootWorkspace = await getRepoRootWorkspace();
    let exitCode: number = 0;
    const allowedExternalDependenices = await collectAllExternalDependencies([
        repoRootWorkspace,
        ...repoRootWorkspace.getRecursiveWorkspaceChildren(),
    ]);

    for (let packageSpecifier of program.args) {
        exitCode =
            exitCode == 0
                ? await bootstrapPackage(
                      repoRootWorkspace,
                      allowedExternalDependenices,
                      packageSpecifier,
                  )
                : exitCode;
    }

    if (exitCode !== 0) {
        return exitCode;
    }

    const packageNativeDir = npath.fromPortablePath(
        repoRootWorkspace.project.cwd,
    );
    console.log('spawning yarn to resolve the workspace in', packageNativeDir);
    try {
        await asyncSpawn(
            process.platform === 'win32' ? 'yarn.cmd' : 'yarn',
            ['install'],
            {
                cwd: packageNativeDir,
                stdio: 'inherit',
            },
        );
    } catch (e) {
        console.error('encountered error trying to run yarn', e);
        console.error(
            'you may need to run yarn manually to resolve your workspace',
        );
        return 1;
    }

    return exitCode;
}

main().then(
    (exitCode: number) => process.exit(exitCode),
    (e) => {
        console.log('exiting due to error:');
        console.error(e);
        process.exit(1);
    },
);
