import { Configuration, Project, Workspace } from '@yarnpkg/core';
import { PortablePath, ppath } from '@yarnpkg/fslib';

export async function getRepoRootWorkspace(): Promise<Workspace> {
    // check for an existing workspace
    const cwd = ppath.cwd();
    const configuration = await Configuration.find(
        cwd,
        {
            modules: new Map(),
            plugins: new Set(),
        },
        {
            strict: false,
        },
    );
    const { project } = await Project.find(configuration, cwd);

    return project.topLevelWorkspace;
}

export async function getRepoRootPPath(): Promise<PortablePath> {
    return (await getRepoRootWorkspace()).cwd;
}
