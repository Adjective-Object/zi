export function serializeStreamEntry(name: string, obj: any): string {
    const objJsonStr = JSON.stringify(obj);
    return `${name.length}:${name}${objJsonStr.length}:${objJsonStr}`;
}

export function accumulateNumber(
    buffer: string,
    offset: number,
): [number, number] | null {
    let endIdx = offset;
    while (endIdx < buffer.length && buffer[endIdx] !== ':') {
        endIdx++;
    }
    if (endIdx >= buffer.length || endIdx === offset) {
        return null;
    }
    const numeric = Number(buffer.slice(offset, endIdx));
    if (isNaN(numeric)) {
        return null;
    }
    return [numeric, endIdx];
}

type JsonValue = Record<string, any> | any[] | number | string | null;

export function tryGetEntryFromString(
    bufferString: string,
    initialOffset: number,
): [string, JsonValue, number] | null {
    const nl = accumulateNumber(bufferString, initialOffset);
    if (nl == null) {
        return null;
    }
    const [nameLen, endOfNameLenOffset] = nl;
    // add 1 to skip the colon
    const el = accumulateNumber(bufferString, endOfNameLenOffset + 1 + nameLen);
    if (el == null) {
        return null;
    }
    const [entryLen, endOfEntryLenOffset] = el;
    if (bufferString.length < endOfEntryLenOffset + 1 + entryLen) {
        return null;
    }
    return [
        bufferString.slice(
            endOfNameLenOffset + 1,
            endOfNameLenOffset + 1 + nameLen,
        ),
        JSON.parse(
            bufferString.slice(
                endOfEntryLenOffset + 1,
                endOfEntryLenOffset + 1 + entryLen,
            ),
        ),
        endOfEntryLenOffset + 1 + entryLen,
    ];
}
