import commander from 'commander';
import { ppath, NodeFS, toFilename } from '@yarnpkg/fslib';
import { getRepoRootWorkspace } from 'get-repo-root';
import { ConfigManager } from 'config-editor';
import { resolvePackageStub } from 'resolve-package-stub';
import { renamePackage } from '@yarnpkg/core/lib/structUtils';
import { runYarnAndWarn } from 'run-yarn-at-root';

async function main(): Promise<number> {
    const fs = new NodeFS();

    const packageVersion = require('../../package.json').version || 'pre-alpha';
    const program = commander.program
        .version(packageVersion)
        .usage('[options] <packageName>');
    program.parse(process.argv);

    if (program.args.length !== 2) {
        console.error('usage: movepackage <package name> package/stub');
        return 1;
    }
    const [sourcePackageName, destinationPackageSpecifier] = program.args;

    // find the workspace of the source package
    const repoRootWorkspace = await getRepoRootWorkspace();
    const sourcePackageWorkspace = repoRootWorkspace
        .getRecursiveWorkspaceChildren()
        .find((x) => x.manifest.name.name === sourcePackageName);

    if (!sourcePackageWorkspace) {
        console.error(
            `unable to find source package "${sourcePackageName}" by name."`,
        );
        return 1;
    }

    // figure out where the package needs to be renamed / moved to
    const { packageName: destinationPackageName, packageDir: parsedDestDir } =
        resolvePackageStub(repoRootWorkspace, destinationPackageSpecifier);

    // HACK: override if it was a simple rename by checking if the dest dir from the specifier
    // is the packages root
    const relativePPathToPackagesRoot = ppath.relative(
        parsedDestDir,
        ppath.join(repoRootWorkspace.cwd, toFilename('packages')),
    );
    const packageDestDir =
        relativePPathToPackagesRoot === '.'
            ? sourcePackageWorkspace.cwd
            : parsedDestDir;

    const configManager = new ConfigManager();

    if (destinationPackageName !== sourcePackageName) {
        await renamePackage(
            configManager,
            repoRootWorkspace,
            sourcePackageWorkspace,
            packageDir,
        );
    }

    if (
        ppath.resolve(packageDestDir) !==
        ppath.resolve(sourcePackageWorkspace.cwd)
    ) {
        // we need to move the package
        await movePackageDirectory(
            configManager,
            repoRootWorkspace,
            sourcePackageWorkspace,
            packageDir,
        );
    }

    await runYarnAndWarn();

    return 0;
}

main().then(
    (exitCode: number) => process.exit(exitCode),
    (e) => {
        console.log('exiting due to error:');
        console.error(e);
        process.exit(1);
    },
);
