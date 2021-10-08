import { getIntendedConfigsForChildWorkspaces } from 'intended-config';
import { getRepoRootWorkspace } from 'get-repo-root';
import { ConfigManager, Change } from 'config-editor';
import { runWithConcurrentLimit } from 'run-with-concurrent-limit';
import { Workspace } from '@yarnpkg/core';
import { compare as compareSemverRange } from 'semver-compare-range';
import builtins from 'builtin-modules';
import { Command } from 'commander';
import { runYarnAndWarn } from 'run-yarn-at-root';
import * as path from 'path';
import { NodeFS, npath, ppath } from '@yarnpkg/fslib';
import { getMonorepoConfig } from 'get-monorepo-config';
import mkdirp from 'mkdirp';

function collectAllExternalDependencies(
    workspaces: Workspace[],
): Record<string, string | null> {
    const versionsFromAllPackageJson: Map<string, string> = new Map();
    for (let workspace of workspaces) {
        for (let [, version] of [
            ...workspace.manifest.devDependencies.entries(),
            ...workspace.manifest.dependencies.entries(),
        ]) {
            const dependency = version.scope
                ? `@${version.scope}/${version.name}`
                : version.name;
            const newVersion = version.range;
            const existingVersion = versionsFromAllPackageJson.get(dependency);
            if (
                !newVersion.startsWith('workspace:') &&
                (!existingVersion ||
                    compareSemverRange(existingVersion, newVersion) < 0)
            ) {
                versionsFromAllPackageJson.set(dependency, newVersion);
            }
        }
    }

    return Object.fromEntries([
        ...versionsFromAllPackageJson.entries(),
        // "foo": null versions are omitted from package.json versions
        // so we explicitly omit packages from node.
        ...builtins.map((moduleName) => [moduleName, null]),
    ]);
}

async function main(): Promise<number> {
    const program = new Command();
    program
        .version('0.0.1')
        .option('-c, --check', 'Check that there is no diff')
        .option('-d, --dry-run', 'Print the diff without writing')
        .parse(process.argv);

    const opts = program.opts();
    console.log('opts', opts);

    const fs = new NodeFS();

    console.log('Finding repo roots');
    const repoRootWorkspace = await getRepoRootWorkspace();
    const configManager = new ConfigManager();
    const externalDependencies = collectAllExternalDependencies([
        repoRootWorkspace,
        ...repoRootWorkspace.getRecursiveWorkspaceChildren(),
    ]);

    console.log('Generating intended configs');
    await getIntendedConfigsForChildWorkspaces(
        configManager,
        repoRootWorkspace,
        {
            permittedPackageVersions: externalDependencies,
            ...(await getMonorepoConfig(fs)),
        },
    );

    console.log('Generating changeset against on-disk files');
    const changes = await configManager.generateChangeset();

    if (opts['dryRun'] || opts['check']) {
        for (let change of changes) {
            console.log(
                'difference in',
                path.relative(process.cwd(), change.getPath()),
            );
            console.log(change.getTextDiff());
        }
    }

    if (!changes.length) {
        console.log('No updates needed.');
        return 0;
    }

    if (opts['check']) {
        console.error('State on-disk is out of date.');
    } else if (!opts['dryRun']) {
        console.log('Committing changes to disk.');
        await runWithConcurrentLimit(
            10,
            changes,
            async (change: Change) => {
                // If we are changing the input field of the package,
                // we need to move the old input file to its new location
                if (change.getPath().endsWith('package.json')) {
                    const oldInputPath = change.originalFileContents?.input;
                    const newInputPath = change.mergedContent?.input;
                    if (
                        typeof oldInputPath === 'string' &&
                        typeof newInputPath === 'string' &&
                        newInputPath !== oldInputPath
                    ) {
                        // console.log(
                        //     `${change.getPath()}: moving old input ${oldInputPath} to ${newInputPath}`,
                        // );
                        const inPathFull = ppath.join(
                            ppath.dirname(
                                npath.toPortablePath(change.getPath()),
                            ),
                            npath.toPortablePath(oldInputPath),
                        );
                        const outPathFull = ppath.join(
                            ppath.dirname(
                                npath.toPortablePath(change.getPath()),
                            ),
                            npath.toPortablePath(newInputPath),
                        );
                        if (await fs.existsPromise(inPathFull)) {
                            await mkdirp(
                                npath.dirname(
                                    npath.fromPortablePath(outPathFull),
                                ),
                            );
                            await fs.movePromise(inPathFull, outPathFull);
                        }
                    }
                }

                // write the change to disk
                await change.write();
            },
            true, // progressBar
        );

        if (
            changes.some(
                (change) => change.getPath().indexOf('package.json') !== -1,
            )
        ) {
            return await runYarnAndWarn();
        }
    }

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
