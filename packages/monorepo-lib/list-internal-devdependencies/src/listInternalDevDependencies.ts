import { Ident, IdentHash, Workspace } from '@yarnpkg/core';

/**
 * Finds all the children of rootWorkspace that are listed
 * as devDependencies in any child of rootWorkspace.
 *
 * @param rootWorkspace - the workspace to find the dependencies of
 * @returns an iterator over the names of the intenral devDependencies.
 */
export function listInternalDevDependencies(
    rootWorkspace: Workspace,
): Iterable<Workspace> {
    const children = rootWorkspace.getRecursiveWorkspaceChildren();
    const internalPackageNames = new Set<string>(
        children.map((child) => child.manifest.name.name),
    );

    // Get union of all internal devDependencies of all
    // packages in the workspace
    //
    // We don't need to recursively expand this, because the
    // top-level iteration will capture the internal devDependencies
    // of any packages that are on the list.
    const resultIdentHashes = new Set<IdentHash>();
    const identHashToWorkspace = new Map<IdentHash, Workspace>();
    for (let individualWorkspace of [...children, rootWorkspace]) {
        identHashToWorkspace.set(
            individualWorkspace.manifest.name.identHash,
            individualWorkspace,
        );
        const devDependencyEntries = [
            ...individualWorkspace.manifest.devDependencies.entries(),
        ].filter(
            ([packageIdent, packageVersion]) =>
                internalPackageNames.has(packageIdent) &&
                packageVersion.range.startsWith('workspace:'),
        );

        for (let [devDependencyIdent] of devDependencyEntries) {
            resultIdentHashes.add(devDependencyIdent);
        }
    }

    // recurisvely expand the dependencies of the internal dependencies
    const seenInWalk = new Set<IdentHash>(resultIdentHashes);
    const frontier: IdentHash[] = [...resultIdentHashes];
    while (frontier.length) {
        const current = frontier.pop();
        const currentWorkspace = identHashToWorkspace.get(current);
        for (let dependencyIdent of currentWorkspace.dependencies.keys()) {
            seenInWalk.add(dependencyIdent);
            frontier.push(dependencyIdent);
            resultIdentHashes.add(dependencyIdent);
        }
    }

    return rootWorkspace
        .getRecursiveWorkspaceChildren()
        .filter((workspace) =>
            resultIdentHashes.has(workspace.manifest.name.identHash),
        );
}
