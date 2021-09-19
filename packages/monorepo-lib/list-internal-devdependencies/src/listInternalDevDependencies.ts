import { Workspace } from '@yarnpkg/core';

/**
 * Finds all the children of rootWorkspace that are listed
 * as devDependencies in any child of rootWorkspace.
 * 
 * @param rootWorkspace - the workspace to find the dependencies of
 * @returns an iterator over the names of the intenral devDependencies.
 */
export function listInternalDevDependencies(
    rootWorkspace: Workspace,
): Iterable<string> {
    const children = rootWorkspace.getRecursiveWorkspaceChildren();
    const internalPackageNames = new Set<string>(
        children.map(child => child.manifest.name.name)
    );
    
    // Get union of all internal devDependencies of all
    // packages in the workspace
    //
    // We don't need to recursively expand this, because the
    // top-level iteration will capture the internal devDependencies
    // of any packages that are on the list.
    const internalDevDependencyNames = new Set<string>();
    for (let individualWorkspace of [...children, rootWorkspace]) {
        const devDependencyEntries = Object.entries(individualWorkspace.manifest.devDependencies).filter(([packageName, packageVersion]) => internalPackageNames.has(packageName) && packageVersion.startsWith('workspace:'))
        for (let [devDependencyName] of devDependencyEntries) {
            internalDevDependencyNames.add(devDependencyName)
        }
    }

    return internalDevDependencyNames
}