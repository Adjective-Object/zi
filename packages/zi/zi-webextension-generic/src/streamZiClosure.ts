import { tryGetEntryFromString } from 'zi-closure';

const SOFT_MAX_ACCUM_BUFFER = 4096;

export async function streamZiClosure(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onReadEntry: (name: string, content: any) => void,
) {
    let accumulatedString = '';
    let currentAccumulatedOffset = 0;
    let decoder = new TextDecoder();
    let consecutiveFailedReads = 0;
    while (true) {
        const { value: nextChunk, done } = await reader.read();
        if (done || !nextChunk) {
            break;
        }
        // This might be totally unsound and break when a multibyte
        // character straddles a chunk.
        // Or it might be fine because JS strings do not actually
        // have good local multibyte string support.
        //
        // TODO figure out how multibyte characters are handled
        // when streaming as a uint8array.
        console.log(
            'nextChunk.byteLength',
            nextChunk.byteLength,
            accumulatedString.length,
        );
        if (consecutiveFailedReads > 10) {
            console.log(accumulatedString);
            throw new Error(
                `Failed to parse ${consecutiveFailedReads} times in a row. Aborting.`,
            );
        }
        accumulatedString += decoder.decode(nextChunk);
        let nextEntry: [string, any, number] | null = null;
        while (true) {
            if (accumulatedString[currentAccumulatedOffset] == '\n') {
                currentAccumulatedOffset += 1;
            }
            nextEntry = tryGetEntryFromString(
                accumulatedString,
                currentAccumulatedOffset,
            );
            console.log('nextEntry', nextEntry);
            if (nextEntry === null) {
                // break and read next chunk
                consecutiveFailedReads += 1;
                break;
            } else {
                consecutiveFailedReads = 0;
                let [name, content, nextOffset] = nextEntry;
                onReadEntry(name, content);
                currentAccumulatedOffset = nextOffset;
            }
        }
        if (accumulatedString.length >= SOFT_MAX_ACCUM_BUFFER) {
            console.log('slicing accumulated string!');
            // update accumulated string and offset to avoid eating too much memory
            accumulatedString = accumulatedString.slice(
                currentAccumulatedOffset,
            );
            currentAccumulatedOffset = 0;
        }
    }
}
