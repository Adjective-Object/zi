import { Workspace } from '@yarnpkg/core';
import { compare as compareSemverRange } from 'semver-compare-range';
import builtins from 'builtin-modules';

export function collectAllExternalDependencies(
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
