import getOpts from 'get-options';
import { run } from './ziCompileClosure';
import { getZiConfigFromDisk } from 'zi-config';

const FALSE_OPTIONS = ['no', 'false'];

async function main() {
    const optionsObject = {
        '-c, --config': '<zi-config.json>',
        '-t, --tsconfig': '<tsconfig.json>',
        '-o, --output': '<outputPath>',
        '-r, --root': '<rootDir>',
        '-j, --concurrency': '<concurrency>',
        '-s, --preProcessSass': '<yes|no|true|false>',
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
    const args = parsedOptions.argv.slice(
        parsedOptions.argv.indexOf(__filename) + 1,
    );
    const {
        closure: closureOptions,
        entry,
        fromFilePath,
    } = await getZiConfigFromDisk(process.cwd(), parsedOptions.options.config);

    console.log(`loaded config from ${fromFilePath}`);

    const inputPatterns = args.length ? args : closureOptions.inputPatterns;

    if (inputPatterns.length == 0) {
        throw new Error(
            'Got empty set of input patterns array, expected a list globs to build or a list of input patterns in the zi config.',
        );
    }

    const runOptions = {
        tsconfigPath:
            parsedOptions.options.tsconfig ?? closureOptions.tsconfigPath,
        outputPath: parsedOptions.options.output ?? closureOptions.outputPath,
        inputGlobsOrFiles: args.length ? args : closureOptions.inputPatterns,
        rootDir: parsedOptions.options.root ?? closureOptions.rootDir,
        progressBar: true,
        concurrency:
            parseInt(parsedOptions.options.concurrency) ||
            closureOptions.concurrency,
        preProcessSass: parsedOptions.options.preProcessSass
            ? !FALSE_OPTIONS.includes(parsedOptions.options.preProcessSass)
            : closureOptions.preProcessSass,
        entry,
    };
    console.log('running with options', runOptions);
    await run(runOptions);
}

main().then(
    () => process.exit(0),
    (e) => {
        console.error(e);
        process.exit(1);
    },
);
