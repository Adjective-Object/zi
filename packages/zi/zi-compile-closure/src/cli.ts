import getOpts from 'get-options';
import { Command } from 'commander';
import { run } from './ziCompileClosure';
import { getZiConfigFromDisk } from 'zi-config';

const FALSE_OPTIONS = ['no', 'false'];

async function main() {
    const program = new Command()
        .version('0.0.1')
        .option('-c, --config <zi-config.json>')
        .option('-t, --tsconfig <tsconfig.json>')
        .option('-o, --output <outputPath>')
        .option('-r, --root <rootDir>')
        .option('-j, --concurrency <concurrency>')
        .option('-s, --preProcessSass <yes|no|true|false>')
        .option('-p, --progressBar <yes|no|true|false>')
        .parse(process.argv);

    const opts = program.opts();
    const args = program.args;

    const {
        closure: closureOptions,
        entry,
        fromFilePath,
    } = await getZiConfigFromDisk(process.cwd(), opts.config);

    console.log(`loaded config from ${fromFilePath}`);

    const inputPatterns = args.length ? args : closureOptions.inputPatterns;

    if (inputPatterns.length == 0) {
        throw new Error(
            'Got empty set of input patterns array, expected a list globs to build or a list of input patterns in the zi config.',
        );
    }

    const runOptions = {
        tsconfigPath: opts.tsconfig ?? closureOptions.tsconfigPath,
        outputPath: opts.output ?? closureOptions.outputPath,
        inputPatterns,
        rootDir: opts.root ?? closureOptions.rootDir,
        progressBar: !FALSE_OPTIONS.includes(opts.progressBar),
        concurrency: parseInt(opts.concurrency) || closureOptions.concurrency,
        preProcessSass: opts.preProcessSass
            ? !FALSE_OPTIONS.includes(opts.preProcessSass)
            : closureOptions.preProcessSass,
        expectErrorOn: closureOptions.expectErrorOn,
        expectWarningOn: closureOptions.expectWarningOn,
        singleModuleWarningSize: closureOptions.singleModuleWarningSize,
        minify: closureOptions.minify,
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
