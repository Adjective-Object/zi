import type { ZiEntrypointOptions } from 'zi-config';

export type ZiClosureMeta = {
    compilation: {
        id: string;
        timestamp: string;
    };
    entry: ZiEntrypointOptions;
    fileCount: number;
};

export type ZiClosureEntry = string;
