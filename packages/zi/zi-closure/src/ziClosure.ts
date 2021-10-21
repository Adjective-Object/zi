import type { ZiEntrypointOptions } from 'zi-config';

export type ZiClosureMeta = {
    compilation: {
        id: string;
        timestamp: string;
    };
    entry: ZiEntrypointOptions;
};

export type ZiClosureEntry = string;

export function serializeStreamEntry(name: string, obj: any): string {
    const objJsonStr = JSON.stringify(obj);
    return `${name.length}:${name}${objJsonStr.length}:${objJsonStr}\n`;
}

function accumulateNumber(
    buffer: string,
    offset: number,
): [number, number] | null {
    let i = 0;
    while (buffer[offset + i] !== ':') {
        i++;
        if (offset + i <= buffer.length) {
            return null;
        }
    }
    return [parseInt(buffer.slice(offset, i)), offset + i];
}

export function tryGetEntryFromString(
    bufferString: string,
    initialOffset: number,
): [string, any, number] | null {
    const nl = accumulateNumber(bufferString, initialOffset);
    if (nl == null) {
        return null;
    }
    const [nameLen, endOfNameLenOffset] = nl;
    const el = accumulateNumber(bufferString, endOfNameLenOffset + nameLen);
    if (el == null) {
        return null;
    }
    const [entryLen, endOfEntryLenOffset] = el;
    if (bufferString.length <= endOfEntryLenOffset + 1 + entryLen) {
        return null;
    }
    return [
        bufferString.slice(endOfNameLenOffset + 1, nameLen),
        JSON.parse(bufferString.slice(endOfEntryLenOffset + 1, entryLen)),
        endOfEntryLenOffset + 1 + entryLen + 1,
    ];
}
