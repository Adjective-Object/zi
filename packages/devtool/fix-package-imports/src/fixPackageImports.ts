import { getIntendedConfigsForChildWorkspaces } from 'intended-config';
import { getRepoRootWorkspace } from 'get-repo-root';
import { ConfigManager, Change } from 'config-editor';
import { runWithConcurrentLimit } from 'run-with-concurrent-limit';
import { Workspace } from '@yarnpkg/core';
import { compare as compareSemverRange } from 'semver-compare-range';
import builtins from 'builtin-modules';

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

async function main() {
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

    if (!changes.length) {
        console.log('No changes to perform. exiting.');
        return;
    } else {
        console.log('Committing changes to disk.');
        await runWithConcurrentLimit(
            10,
            changes,
            (change: Change) => change.write(),
            true, // progressBar
        );
    }
}

main().catch((e) => {
    console.log('exiting due to error:');
    console.error(e);
    process.exit(1);
});
