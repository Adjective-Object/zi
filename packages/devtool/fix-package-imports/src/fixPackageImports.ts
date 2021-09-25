import { getIntendedConfigsForChildWorkspaces } from 'intended-config';
import { getRepoRootWorkspace } from 'get-repo-root';
import { ConfigManager, Change } from 'config-editor';
import { runWithConcurrentLimit } from 'run-with-concurrent-limit';
import { Workspace } from '@yarnpkg/core';
import { compare as compareSemverRange } from 'semver-compare-range';
import builtins from 'builtin-modules';
import { Command } from 'commander';
import * as path from 'path';

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
            extraScripts: {},
            permittedPackageVersions: externalDependencies,
            repoMeta: {
                repoHomepageBaseUrl:
                    'https://github.com/Adjective-Object/zi/tree/master/packages/',
                repoIssuesUrl: 'https://github.com/Adjective-Object/zi/issues',
                repoGitUrl: 'git@github.com:Adjective-Object/zi.git',
            },
            packageAuthor: 'Maxwell Huang-Hobbs <mhuan13@gmail.com>',
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
            (change: Change) => change.write(),
            true, // progressBar
        );
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
