import { FakeFS, npath, PortablePath, ppath, toFilename } from '@yarnpkg/fslib';
import { getRepoRootPPath } from 'get-repo-root';

export type RepoMeta = {
    repoGitUrl: string;
    repoIssuesUrl: string;
    repoHomepageBaseUrl: string;
};

export type MonorepoConfig = {
    extraScripts: {};
    repoMeta: RepoMeta;
    packageAuthor: string;
    license: string;
};

const DEFAULT_CONFIG: MonorepoConfig = {
    extraScripts: {},
    repoMeta: {
        repoHomepageBaseUrl:
            'TODO : https://github.com/you/your-project/tree/main/packages/',
        repoIssuesUrl: 'TODO : https://github.com/you/your-project/issues',
        repoGitUrl: 'TODO : git@github.com/you/your-project.git',
    },
    packageAuthor: 'An Anonymous Developer',
    license: 'UNLICENSED',
};

async function getDefaultConfig(
    fs: FakeFS<PortablePath>,
): Promise<MonorepoConfig> {
    const rootPackageJson = ppath.join(
        await getRepoRootPPath(),
        toFilename('package.json'),
    );
    try {
        const packageJsonStringContent = (await fs.readFilePromise(
            rootPackageJson,
            'utf-8',
        )) as unknown as string;
        const packageJsonContent = JSON.parse(packageJsonStringContent);
        const copiedConfig: MonorepoConfig = {
            ...DEFAULT_CONFIG,
            repoMeta: {
                ...DEFAULT_CONFIG.repoMeta,
            },
        };
        if (packageJsonContent.author) {
            copiedConfig.packageAuthor = packageJsonContent.author;
        }

        if (packageJsonContent.license) {
            copiedConfig.license = packageJsonContent.license;
        }

        if (packageJsonContent.repository) {
            copiedConfig.repoMeta.repoGitUrl = packageJsonContent.repository;
        }

        if (packageJsonContent.issues) {
            copiedConfig.repoMeta.repoIssuesUrl = packageJsonContent.issues;
        }

        return copiedConfig;
    } catch (e) {
        console.warn(e);
        return DEFAULT_CONFIG;
    }
}

export async function getMonorepoConfig(
    fs: FakeFS<PortablePath>,
): Promise<MonorepoConfig | null> {
    const configPath = ppath.join(
        await getRepoRootPPath(),
        toFilename('.monorepo-config.json'),
    );
    if (!(await fs.existsPromise(configPath))) {
        const defaultConfig = await getDefaultConfig(fs);
        await fs.writeFilePromise(
            configPath,
            JSON.stringify(defaultConfig, null, 4),
        );
        console.warn(
            `failed to read monorepo config from ${npath.fromPortablePath(
                configPath,
            )} . A placeholder has been generated, please update it and re-run fixrefs.`,
        );
    }
    // typescript won't pick the right override here even when I provide utf-8.
    // TODO investigate further -- this might be a strict/nonstrict issue.
    const configContentString = (await fs.readFilePromise(
        configPath,
        'utf-8',
    )) as unknown as string;
    return JSON.parse(configContentString);
}
