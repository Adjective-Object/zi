import getOpts from 'get-options';
import { run } from './ziCompileClosure';

async function main() {
    const parsedOptions = getOpts(process.argv, {
        '-c, --config': '<esbuildConfigPath>',
        '-o, --output': '<outputPath>',
        '-r, --root': '<rootDir>',
        '-j, --concurrency': '<concurrency>',
    });
    const args = parsedOptions.argv.slice(
        parsedOptions.argv.indexOf(__filename) + 1,
    );
    if (args.length === 0) {
        throw new Error('Got empty args array, expected a list globs to build');
    }
    await run({
        esbuildConfigPath:
            parsedOptions.options.esbuildConfigPath ?? '.esbuildrc',
        outputPath: parsedOptions.options.outputPath ?? 'zi-closure.json',
        inputGlobs: args,
        rootDir: parsedOptions.options.rootDIr ?? process.cwd(),
        progressBar: true,
        concurrency: parseInt(parsedOptions.options.concurrency) || 200,
    });
}

main().then(
    () => process.exit(0),
    (e) => {
        console.error(e);
        process.exit(1);
    },
);
