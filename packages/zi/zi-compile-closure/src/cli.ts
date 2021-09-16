import getOpts from 'get-options';
import { run } from './ziCompileClosure';

async function main() {
    const optionsObject = {
        '-c, --config': '<tsconfig.json>',
        '-o, --output': '<outputPath>',
        '-r, --root': '<rootDir>',
        '-j, --concurrency': '<concurrency>',
        '-h, --help': '',
    };
    const parsedOptions = getOpts(process.argv, optionsObject);
    if ('help' in parsedOptions.options) {
        console.log('Usage: zi-compile-closure <options> <sourceGlobs>');
        console.log('\n  options:');
        for (let [k, v] of Object.entries(optionsObject)) {
            console.log(`  ${k}: ${v}`);
        }
        process.exit(0);
    }
    console.log('running with options', parsedOptions);
    const args = parsedOptions.argv.slice(
        parsedOptions.argv.indexOf(__filename) + 1,
    );
    if (args.length === 0) {
        throw new Error('Got empty args array, expected a list globs to build');
    }
    await run({
        tsconfigPath: parsedOptions.options.config ?? 'tsconfig.json',
        outputPath: parsedOptions.options.output ?? 'zi-closure.json',
        inputGlobsOrFiles: args,
        rootDir: parsedOptions.options.root ?? process.cwd(),
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
