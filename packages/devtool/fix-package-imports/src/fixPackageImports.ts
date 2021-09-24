import { getIntendedConfigsForChildWorkspaces } from 'intended-config';
import { getRepoRootWorkspace } from 'get-repo-root';
import { ConfigManager, Change } from 'config-editor';
import { runWithConcurrentLimit } from 'run-with-concurrent-limit';
import { Descriptor } from '@yarnpkg/core';

async function main() {
    console.log('Finding repo roots');
    const repoRootWorkspace = await getRepoRootWorkspace();
    const configManager = new ConfigManager();
    const rootWorkspaceDependencies = Object.fromEntries(
        [
            ...repoRootWorkspace.manifest.devDependencies.entries(),
            ...repoRootWorkspace.manifest.dependencies.entries(),
        ].map(([key, descriptor]: [string, Descriptor]) => [
            key,
            descriptor.range,
        ]),
    );

    console.log('Generating intended configs');
    await getIntendedConfigsForChildWorkspaces(
        configManager,
        repoRootWorkspace,
        {
            extraScripts: {},
            permittedPackageVersions: rootWorkspaceDependencies,
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
