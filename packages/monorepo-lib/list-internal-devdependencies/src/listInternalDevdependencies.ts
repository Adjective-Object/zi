import { IdentHash, Workspace } from '@yarnpkg/core';
import { npath } from '@yarnpkg/fslib';

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
    const internalPackageHashes = new Set<string>(
        children
            .map((child) => child.manifest.name?.identHash)
            .filter(
                <T>(x: T | undefined): x is Exclude<T, undefined> =>
                    x != undefined,
            ),
    );

    // Get union of all internal devDependencies of all
    // packages in the workspace
    //
    // We don't need to recursively expand this, because the
    // top-level iteration will capture the internal devDependencies
    // of any packages that are on the list.
    const resultIdentHashes = new Set<IdentHash>();
    const identHashToInternalWorkspace = new Map<IdentHash, Workspace>();
    for (let individualWorkspace of [...children, rootWorkspace]) {
        if (!individualWorkspace.manifest.name) {
            throw new Error(
                `Internal workspace at ${npath.fromPortablePath(
                    individualWorkspace.cwd,
                )} had no name! Could not get the identHash of the name.`,
            );
        }
        identHashToInternalWorkspace.set(
            individualWorkspace.manifest.name.identHash,
            individualWorkspace,
        );

        const devDependencyEntries = [
            ...individualWorkspace.manifest.devDependencies.entries(),
        ].filter(([packageIdent, packageVersion]) => {
            return (
                internalPackageHashes.has(packageIdent) &&
                packageVersion.range.startsWith('workspace:')
            );
        });

        for (let [devDependencyIdent] of devDependencyEntries) {
            resultIdentHashes.add(devDependencyIdent);
        }
    }

    // recurisvely expand the dependencies of the internal dependencies
    const seenInWalk = new Set<IdentHash>(resultIdentHashes);
    const frontier: IdentHash[] = [...resultIdentHashes];
    while (frontier.length) {
        const current = frontier.pop();
        const currentInternalWorkspace =
            identHashToInternalWorkspace.get(current);
        if (currentInternalWorkspace) {
            // this hash is to an internal package, walk and expand dependencies
            for (let dependencyIdent of currentInternalWorkspace.manifest.dependencies.keys()) {
                if (!seenInWalk.has(dependencyIdent)) {
                    seenInWalk.add(dependencyIdent);
                    frontier.push(dependencyIdent);
                    resultIdentHashes.add(dependencyIdent);
                }
            }
        }
    }

    return rootWorkspace
        .getRecursiveWorkspaceChildren()
        .filter((workspace) =>
            resultIdentHashes.has(workspace.manifest.name.identHash),
        );
}
