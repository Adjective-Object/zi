import { abort } from 'process';
import { tryGetEntryFromString } from 'zi-closure';
import { tryLookAheadRequiredLength } from 'zi/zi-closure/src/serialization';

const SOFT_MAX_ACCUM_BUFFER = 4096;

export class ZiClosureStreamer {
    shouldStream: boolean = true;
    constructor(
        private reader: ReadableStreamDefaultReader<Uint8Array>,
        private onReadEntry: (name: string, content: any) => Promise<void>,
    ) {}

    abortStream() {
        this.shouldStream = false;
    }

    async stream() {
        this.shouldStream = true;
        let accumulatedString = '';
        let currentAccumulatedOffset = 0;
        let decoder = new TextDecoder();
        let consecutiveFailedReads = 0;
        while (this.shouldStream) {
            if (consecutiveFailedReads > 10) {
                console.log(accumulatedString);
                console.error(await this.reader.read());
                throw new Error(
                    `Failed to parse ${consecutiveFailedReads} times in a row. Aborting.`,
                );
            }

            const requiredLength = tryLookAheadRequiredLength(
                accumulatedString,
                currentAccumulatedOffset,
            );

            do {
                const { value: nextChunk, done } = await this.reader.read();
                if (done || !nextChunk) {
                    return;
                }
                // This might be totally unsound and break when a multibyte
                // character straddles a chunk.
                // Or it might be fine because JS strings do not actually
                // have good local multibyte string support.
                //
                // TODO figure out how multibyte characters are handled
                // when streaming as a uint8array.
                accumulatedString += decoder.decode(nextChunk);
            } while (
                // Repeat the read until we hit the required length
                // if we can/have read the header of the current entry.
                requiredLength !== null &&
                accumulatedString.length < requiredLength
            );

            let nextEntry: [string, any, number] | null = null;
            while (this.shouldStream) {
                while (/\s/.exec(accumulatedString[currentAccumulatedOffset])) {
                    currentAccumulatedOffset += 1;
                }
                nextEntry = tryGetEntryFromString(
                    accumulatedString,
                    currentAccumulatedOffset,
                );
                if (nextEntry === null) {
                    // break and read next chunk
                    consecutiveFailedReads += 1;
                    break;
                } else {
                    consecutiveFailedReads = 0;
                    let [name, content, nextOffset] = nextEntry;
                    await this.onReadEntry(name, content);
                    currentAccumulatedOffset = nextOffset;
                }
            }
            if (accumulatedString.length >= SOFT_MAX_ACCUM_BUFFER) {
                // update accumulated string and offset to avoid eating too much memory
                accumulatedString = accumulatedString.slice(
                    currentAccumulatedOffset,
                );
                currentAccumulatedOffset = 0;
            }
        }
    }
}
