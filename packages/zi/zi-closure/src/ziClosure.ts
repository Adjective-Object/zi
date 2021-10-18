import type { ZiEntrypointOptions } from 'zi-config';

export type ZiClosure = {
    /**
     * Metadata about this closure
     */
    meta: {
        compilation: {
            id: string;
            timestamp: string;
        };
        entry: ZiEntrypointOptions;
    };
    /**
     * Record of relative path : transpiled file content in this closure
     */
    closure: Record<string, ZiClosureEntry>;
};

export type ZiClosureEntry = string;

export function getItemFromClosure(
    closure: ZiClosure,
    path: string,
): string | null {
    return closure.closure[path] ?? null;
}
