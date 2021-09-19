import { IdentHash } from '@yarnpkg/core';
import { PortablePath } from '@yarnpkg/fslib';

/**
 * Abstraction over workspace to allow config-management
 * for nonexistent workspaces.
 */
export type PackageLike = {
    cwd: PortablePath;
    manifest: {
        name: {
            name: string;
            identHash: IdentHash;
        };
    };
};
