import {
    accumulateNumber,
    serializeStreamEntry,
    tryGetEntryFromString,
} from '../serialization';

describe('serializeStreamEntry', () => {
    it('parses a serialized entry', () => {
        expect(
            serializeStreamEntry('name', { content: 'test_content' }),
        ).toMatchInlineSnapshot(
            `"4:name26:{\\"content\\":\\"test_content\\"}"`,
        );
    });
});

describe('accumulateNumber', () => {
    it('accumulates a number from the start of a string', () => {
        expect(accumulateNumber('42:', 0)[0]).toEqual(42);
    });

    it('accumulates a number from the middle of a string', () => {
        expect(accumulateNumber('a25:', 1)[0]).toEqual(25);
    });

    it('returns the starting index plus the length of the numeric string', () => {
        expect(accumulateNumber('42:', 0)[1]).toEqual(2);
        expect(accumulateNumber('49200:', 0)[1]).toEqual(5);
        expect(accumulateNumber('a420:', 1)[1]).toEqual(4);
    });

    it('accumulates a number from the middle of a string', () => {
        expect(accumulateNumber('a25:', 1)[0]).toEqual(25);
    });

    it('fails to accumulate from an empty string', () => {
        expect(accumulateNumber('', 0)).toEqual(null);
    });

    it('fails to accumulate a nonnumeric string', () => {
        expect(accumulateNumber('4a2:0', 0)).toEqual(null);
    });

    it('fails to accumulate a number without a terminating colon', () => {
        expect(accumulateNumber('42', 0)).toEqual(null);
    });
});

describe('tryGetEntryFromString', () => {
    it('parses a single serialized entry from the start of the string', () => {
        const buffer = serializeStreamEntry('name', {
            content: 'test_content',
        });
        const result = tryGetEntryFromString(buffer, 0);
        expect(result).toEqual([
            'name',
            { content: 'test_content' },
            buffer.length,
        ]);
    });
    it('parses a 2 sequential serialized entries from the middle of a string', () => {
        const firstEntry = serializeStreamEntry('name', {
            content: 'test_content',
        });
        const buffer =
            'junk' + firstEntry + serializeStreamEntry('foo', { bar: 'baz' });
        const result = tryGetEntryFromString(buffer, 4);
        expect(result).toEqual([
            'name', // expected key
            { content: 'test_content' }, // expected parse
            4 + firstEntry.length, // expected next idx in buffer
        ]);
        const result2 = tryGetEntryFromString(buffer, result[2]);
        expect(result2).toEqual(['foo', { bar: 'baz' }, buffer.length]);
    });
});
