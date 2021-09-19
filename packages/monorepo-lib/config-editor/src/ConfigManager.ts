import { Workspace } from '@yarnpkg/core';
import { Change } from './Change';
import { PackageConfigsManager } from './PackageConfigsManager';

export class ConfigManager {
    private manifestIdentToConfigManager = new Map<
        string,
        PackageConfigsManager
    >();

    public getManagerForWorkspace(childWorkspace: Workspace) {
        let existingConfigManager = this.manifestIdentToConfigManager.get(
            childWorkspace.manifest.indent,
        );
        if (!existingConfigManager) {
            const newManager = new PackageConfigsManager(childWorkspace);
            this.manifestIdentToConfigManager.set(
                childWorkspace.manifest.indent,
                newManager,
            );

            return newManager;
        }

        return existingConfigManager;
    }

    public async generateChangeset(): Promise<Change[]> {
        const changeArray: Change[][] = await Promise.all(
            [...this.manifestIdentToConfigManager.values()].map((v) =>
                v.generateChangeset(),
            ),
        );
        return changeArray.reduce((a, b) => a.concat(b), []);
    }
}
