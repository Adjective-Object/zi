import commander from 'commander';
import { Project } from '@yarnpkg/core';
import {
    ppath,
    toFilename,
    Stats,
    NodeFS,
    PortablePath,
    npath,
} from '@yarnpkg/fslib';
import { asyncSpawn } from 'async-spawn';
import { getRepoRootWorkspace} from 'get-repo-root';

function kebabToCamel(kebab: string): string {
    const [firstWord, ...restWords] = kebab.split('-');
    return (
        firstWord.toLocaleLowerCase() +
        restWords.map((w) => w[0].toUpperCase() + w.substr(1)).join('')
    );
}

async function bootstrapPackage(project: Project, packageSpecifierStr: string) {
    const packageSpecifier = ppath.join(
        ...packageSpecifierStr.split(ppath.sep).map(toFilename),
    );
    const destinationDirectory = ppath.dirname(packageSpecifier);
    const intendedPackageName = ppath.basename(packageSpecifier);

    console.log('creating new package', intendedPackageName);

    const children = project.topLevelWorkspace.getRecursiveWorkspaceChildren();
    for (let child of children) {
        if (child.manifest.name?.name === intendedPackageName) {
            console.error(
                `Workspace already has a package named ${intendedPackageName} at path ${child.cwd}`,
            );
            return 1;
        }
    }

    const fs = new NodeFS();

    // check if the packages directory path is a directory
    const packagesDirectory = ppath.join(
        project.topLevelWorkspace.cwd,
        toFilename('packages'),
    );
    let dirStat: Stats;
    try {
        dirStat = await fs.statPromise(packagesDirectory);
    } catch (e) {
        console.error(`Error while statting ${packagesDirectory}: ${e}`);
        return 1;
    }
    if (!dirStat.isDirectory) {
        console.error(`Path ${packagesDirectory} was not a directory`);
        return 1;
    }

    // Make the destination directory
    const newPackageDirectory: PortablePath = ppath.join(
        packagesDirectory,
        destinationDirectory,
        intendedPackageName,
    );

    // check if the package destination path already exists
    if (await fs.existsPromise(newPackageDirectory)) {
        console.error(`Path ${newPackageDirectory} already existed`);
        return 1;
    }

    const srcDir: PortablePath = ppath.join(
        newPackageDirectory,
        toFilename('src'),
    );
    await fs.mkdirpPromise(srcDir);

    // copying the source package to the destination
    const templateDirPath = ppath.join(
        npath.toPortablePath(__dirname),
        toFilename('..'),
        toFilename('..'),
        toFilename('new-package-template'),
    );
    const templateContents = await fs.readdirPromise(templateDirPath);
    const camelCaseName = kebabToCamel(intendedPackageName);
    await Promise.all(
        templateContents.map(async (fileName) => {
            const templateFilePath = ppath.join(templateDirPath, fileName);
            const templateFileDestinationPath = ppath.join(
                newPackageDirectory,
                fileName.startsWith('_')
                    ? toFilename(fileName.substring(1))
                    : fileName,
            );
            if (fileName === '_package.json') {
                console.log('  templating and copying package.json...');
                // ts not picking up the overloaded file definition..
                const templatePackageJson = JSON.parse(
                    (await fs.readFilePromise(
                        templateFilePath,
                        'utf-8',
                    )) as unknown as string,
                );
                await fs.writeFilePromise(
                    templateFileDestinationPath,
                    JSON.stringify(
                        {
                            name: intendedPackageName,
                            main: `lib/${camelCaseName}.js`,
                            module: `lib/${camelCaseName}.es.js`,
                            types: `lib/${camelCaseName}.d.ts`,
                            ...templatePackageJson,
                        },
                        null,
                        4,
                    ),
                );
            } else if (fileName === '_tsconfig.json') {
                console.log('  templating and copying tsconfig.json...');
                // ts not picking up the overloaded file definition..
                const templatePackageJson = JSON.parse(
                    (await fs.readFilePromise(
                        templateFilePath,
                        'utf-8',
                    )) as unknown as string,
                );
                await fs.writeFilePromise(
                    templateFileDestinationPath,
                    JSON.stringify(
                        {
                            ...templatePackageJson,
                            extends: ppath.join(
                                ...destinationDirectory
                                    .split(ppath.sep)
                                    .map(() => toFilename('..')),
                                toFilename('..'),
                                toFilename('..'),
                                toFilename('tsconfig.json'),
                            ),
                        },
                        null,
                        4,
                    ),
                );
            } else {
                console.log(`  copying ${fileName}...`);
                await fs.copyPromise(
                    templateFilePath,
                    templateFileDestinationPath,
                );
            }
        }),
    );

    console.log('  creating source entrypoint...');
    await fs.mkdirpPromise(ppath.join(destinationDirectory, toFilename('src')));
    await fs.writeFilePromise(
        ppath.join(
            newPackageDirectory,
            toFilename('src'),
            toFilename(`${camelCaseName}.ts`),
        ),
        '',
    );

    console.log(
        'finished creating package at',
        ppath.relative(ppath.cwd(), newPackageDirectory),
    );

    return 0;
}

async function main(): Promise<number> {
    const packageVersion = require('../../package.json').version || 'pre-alpha';
    const program = commander.program
        .version(packageVersion)
        .usage('[options] <packageName>');
    program.parse(process.argv);

    // check for an existing workspace
    cosnt repoRootWorkspace = await getRepoRootWorkspace();
    let exitCode: number = 0;

    for (let packageSpecifier of program.args) {
        exitCode =
            exitCode == 0
                ? await bootstrapPackage(project, packageSpecifier)
                : exitCode;
    }

    if (exitCode !== 0) {
        return exitCode;
    }

    const packageNativeDir = npath.fromPortablePath(project.cwd);
    console.log('spawning yarn to resolve the workspace in', packageNativeDir);
    try {
        await asyncSpawn(
            process.platform === 'win32' ? 'yarn.cmd' : 'yarn',
            ['install'],
            {
                cwd: packageNativeDir,
                stdio: 'inherit',
            },
        );
    } catch (e) {
        console.error('encountered error trying to run yarn', e);
        console.error(
            'you may need to run yarn manually to resolve your workspace',
        );
        return 1;
    }

    return exitCode;
}

main()
    .then((exitCode: number) => process.exit(exitCode))
    .catch((e) => {
        console.log('exiting due to error:');
        console.error(e);
        process.exit(1);
    });
