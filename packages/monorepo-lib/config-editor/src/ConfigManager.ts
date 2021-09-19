import { Change } from './Change';
import { PackageConfigsManager } from './PackageConfigsManager';
import { PackageLike } from './PackageLike';

export class ConfigManager {
    private manifestIdentToConfigManager = new Map<
        string,
        PackageConfigsManager
    >();

    public getManagerForPackageLike(childWorkspace: PackageLike) {
        let existingConfigManager = this.manifestIdentToConfigManager.get(
            childWorkspace.manifest.name.identHash,
        );
        if (!existingConfigManager) {
            const newManager = new PackageConfigsManager(childWorkspace);
            this.manifestIdentToConfigManager.set(
                childWorkspace.manifest.name.identHash,
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
