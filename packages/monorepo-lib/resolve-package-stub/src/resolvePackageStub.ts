import { toFilename, npath, ppath, PortablePath } from '@yarnpkg/fslib';
import { Workspace } from '@yarnpkg/core';

export function resolvePackageStub(
    repoRootWorkspace: Workspace,
    packageStub: string,
): {
    packageName: string;
    packageDir: PortablePath;
} {
    const packageStubAsPortablePath = npath.toPortablePath(packageStub);
    const packageDir = ppath.join(
        repoRootWorkspace.project.topLevelWorkspace.cwd,
        toFilename('packages'),
        packageStubAsPortablePath,
    );
    const packageName = ppath.basename(packageStubAsPortablePath);

    return {
        packageDir,
        packageName,
    };
}
