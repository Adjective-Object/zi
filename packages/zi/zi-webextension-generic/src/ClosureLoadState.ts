export type ClosureLoadState =
    | { type: 'unloaded' }
    | { type: 'success' }
    | { type: 'failed' }
    | { type: 'pending'; processedFiles?: number; totalFileCount?: number };
