import { PortablePath, ppath, npath } from '@yarnpkg/fslib';
import merge from 'lodash/merge';
import { Change } from './Change';
import { PackageLike } from './PackageLike';

export class PackageConfigsManager {
    private intendedContents: Map<PortablePath, object> = new Map();

    constructor(private workspace: PackageLike) {}

    updateIntendedContents(
        relativePath: PortablePath,
        intendedJsonContents: object,
    ) {
        const pathKey = this._getPathKey(relativePath);
        const existing = this.intendedContents.get(relativePath) ?? {};
        this.intendedContents.set(
            pathKey,
            merge(existing, intendedJsonContents),
        );
    }

    private _getPathKey(relativePath: string): PortablePath {
        return ppath.relative(
            this.workspace.cwd,
            npath.toPortablePath(relativePath),
        );
    }

    public async generateChangeset(): Promise<Change[]> {
        const changes: Change[] = await Promise.all(
            [...this.intendedContents.entries()].map(
                async ([relativePath, intendedContents]): Promise<Change> => {
                    // TODO log difference and write out to disk
                    return Change.againstDisk(relativePath, intendedContents);
                },
            ),
        );
        return changes.filter((change) => !change.isEmpty());
    }
}