import { asyncSpawn } from 'async-spawn';
import { getRepoRootWorkspace } from 'get-repo-root';
import { npath } from '@yarnpkg/fslib';

export async function runYarnAndWarn(): Promise<number> {
    const repoRootWorkspace = await getRepoRootWorkspace();
    try {
        await asyncSpawn(
            process.platform === 'win32' ? 'yarn.cmd' : 'yarn',
            ['install'],
            {
                cwd: npath.fromPortablePath(repoRootWorkspace.cwd),
                stdio: 'inherit',
            },
        );
        return 0;
    } catch (e) {
        console.error('encountered error trying to run yarn', e);
        console.error(
            'you may need to run yarn manually to resolve your workspace',
        );
        return 1;
    }
}
