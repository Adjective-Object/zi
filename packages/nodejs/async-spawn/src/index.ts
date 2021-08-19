import {
    spawn,
    SpawnOptionsWithoutStdio,
    SpawnOptionsWithStdioTuple,
    StdioPipe,
    SpawnOptions,
    StdioNull,
} from 'child_process';
export function asyncSpawn(
    command: string,
    options?: SpawnOptionsWithoutStdio,
): Promise<number>;
export function asyncSpawn(
    command: string,
    options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioPipe>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioNull>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    options: SpawnOptionsWithStdioTuple<StdioPipe, StdioNull, StdioPipe>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioPipe>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    options: SpawnOptionsWithStdioTuple<StdioPipe, StdioNull, StdioNull>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioNull>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    options: SpawnOptionsWithStdioTuple<StdioNull, StdioNull, StdioPipe>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    options: SpawnOptionsWithStdioTuple<StdioNull, StdioNull, StdioNull>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    options: SpawnOptions,
): Promise<number>;
export function asyncSpawn(
    command: string,
    args?: ReadonlyArray<string>,
    options?: SpawnOptionsWithoutStdio,
): Promise<number>;
export function asyncSpawn(
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioPipe>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioNull>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnOptionsWithStdioTuple<StdioPipe, StdioNull, StdioPipe>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioPipe>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnOptionsWithStdioTuple<StdioPipe, StdioNull, StdioNull>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioNull>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnOptionsWithStdioTuple<StdioNull, StdioNull, StdioPipe>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnOptionsWithStdioTuple<StdioNull, StdioNull, StdioNull>,
): Promise<number>;
export function asyncSpawn(
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnOptions,
): Promise<number>;

export function asyncSpawn(...args: [any, ...any[]]): Promise<number> {
    const child = spawn(...args);
    let resolve: null | ((exitcode: number) => any) = null;
    let reject: null | ((exitcode: Error) => any) = null;
    child.on('exit', (exitCode: number, err: Error) => {
        if (err) {
            console.error(err);
            reject(err);
        } else {
            resolve(exitCode);
        }
    });
    return new Promise<number>((res, rej) => {
        resolve = res;
        reject = rej;
    });
}
