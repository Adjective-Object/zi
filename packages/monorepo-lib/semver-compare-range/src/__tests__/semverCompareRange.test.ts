import { compare } from '../semverCompareRange';

function checkSortOrder(arr: string[]) {
    expect(arr.slice(0).reverse().sort(compare)).toEqual(arr);
}

function checkSetOrder(arr: string[], arrEq: string[]) {
    expect(arr.slice(0).reverse().sort(compare)).toEqual(arrEq);
}

describe('semver compare', function () {
    describe('invalid version', function () {
        it('invalid vs b = 0', () => {
            expect(() =>
                compare('bad-version', '0.0.1'),
            ).toThrowErrorMatchingInlineSnapshot(
                `"invalid semver ranges or version specified: bad-version"`,
            );
        });
        it('a vs invalid = 0', () => {
            expect(() =>
                compare('0.0.1', 'bad-version'),
            ).toThrowErrorMatchingInlineSnapshot(
                `"invalid semver ranges or version specified: bad-version"`,
            );
        });
    });

    describe('version vs version', function () {
        it('a < b = -1', () => {
            expect(compare('0.0.0', '0.0.1')).toEqual(-1);
        });
        it('a == b = 0', () => {
            expect(compare('0.0.0', '0.0.0')).toEqual(0);
        });
        it('a > b = 1', () => {
            expect(compare('0.0.1', '0.0.0')).toEqual(1);
        });
    });

    describe('version vs range', function () {
        it('a < min(b) = -1', () => {
            expect(compare('0.0.0', '0.0.1 - 0.0.2')).toEqual(-1);
        });
        it('a == min(b) = -1', () => {
            expect(compare('0.0.0', '0.0.0 - 0.0.1')).toEqual(-1);
        });
        it('a > min(b) = 1', () => {
            expect(compare('0.0.1', '0.0.0 - 0.0.2')).toEqual(1);
            expect(compare('0.0.2', '0.0.0 - 0.0.1')).toEqual(1);
        });
    });

    describe('range vs range', function () {
        it('min(a) < min(b) = -1', () => {
            expect(compare('0.0.0 - 0.0.2', '0.0.1 - 0.0.2')).toEqual(-1);
        });
        it('min(a) > min(b) = 1', () => {
            expect(compare('0.0.1 - 0.0.2', '0.0.0 - 0.0.2')).toEqual(1);
        });
        it('min(a) == min(b) && max(a) < max(b) = -1', () => {
            expect(compare('0.0.0 - 0.0.1', '0.0.0 - 0.0.2')).toEqual(-1);
        });
        it('min(a) == min(b) && max(a) > max(b) = 1', () => {
            expect(compare('0.0.0 - 0.0.2', '0.0.0 - 0.0.1')).toEqual(1);
        });
        it('min(a) == min(b) && max(a) == max(b) = 0', () => {
            expect(compare('0.0.0 - 0.0.1', '0.0.0 - 0.0.1')).toEqual(0);
        });
    });

    describe('any version is first', function () {
        it('* vs b = -1', () => {
            expect(compare('*', '0.0.0')).toEqual(-1);
        });
        it('a vs * = 1', () => {
            expect(compare('0.0.0', '*')).toEqual(1);
        });
        it('>=a vs * = 1', () => {
            expect(compare('>=0.0.0', '*')).toEqual(1);
        });
        it('* vs * = 0', () => {
            expect(compare('*', '*')).toEqual(0);
        });
    });
});

describe('semver sorting', function () {
    describe('version vs version', function () {
        const arr1 = ['0.0.0', '0.0.0'];
        it('should sort reverse of ' + arr1.join(' , '), () => {
            expect([...arr1].sort(compare)).toEqual(['0.0.0', '0.0.0']);
        });
        const arr2 = [
            '0.0.0',
            '0.0.1',
            '0.1.0',
            '0.2.0',
            '1.0.0',
            '1.1.0',
            '1.1.1',
            '2.0.0',
        ];
        it('should sort reverse of ' + arr2.join(' , '), () => {
            checkSortOrder(arr2);
        });
    });

    describe('version vs version range', function () {
        const arr1 = ['0.0.0', '0.0.1 - 0.0.2'];
        it('should sort reverse of ' + arr1.join(' , '), () => {
            checkSortOrder(arr1);
        });
        const arr2 = ['0.0.1', '0.0.1 - 0.0.2'];
        it('should sort reverse of ' + arr2.join(' , '), () => {
            checkSortOrder(arr2);
        });
        const arr3 = ['0.0.1 - 0.0.2', '0.0.2'];
        it('should sort reverse of ' + arr3.join(' , '), () => {
            checkSortOrder(arr3);
        });
        const arr4 = ['0.0.0', '0.0.x'];
        it('should sort reverse of ' + arr4.join(' , '), () => {
            checkSortOrder(arr4);
        });
        const arr5 = ['0.0.1', '^0.0.1'];
        it('should sort reverse of ' + arr5.join(' , '), () => {
            checkSortOrder(arr5);
        });
        const arr6 = ['0.0.1', '~0.0.1'];
        it('should sort reverse of ' + arr6.join(' , '), () => {
            checkSortOrder(arr6);
        });
    });

    describe('version range vs version range', function () {
        const arr1 = ['0.0.0 - 0.0.1', '0.0.0 - 0.0.1'];
        it('should sort reverse of ' + arr1.join(' , '), () => {
            checkSortOrder(arr1);
        });
        const arr2 = ['0.0.0 - 0.0.1', '0.0.1 - 0.0.2'];
        it('should sort reverse of ' + arr2.join(' , '), () => {
            checkSortOrder(arr2);
        });
        const arr3 = ['0.0.0 - 0.0.1', '0.0.0 - 0.0.2'];
        it('should sort reverse of ' + arr3.join(' , '), () => {
            checkSortOrder(arr3);
        });
        const arr4 = ['0.0.x', '0.1.x'];
        it('should sort reverse of ' + arr4.join(' , '), () => {
            checkSortOrder(arr4);
        });
        const arr5 = ['~0', '~0.1'];
        it('should sort reverse of ' + arr5.join(' , '), () => {
            checkSortOrder(arr5);
        });
        const arr6 = ['^0.0.0', '^0.0.1'];
        it('should sort reverse of ' + arr6.join(' , '), () => {
            checkSortOrder(arr6);
        });
        const arr7 = ['0.0.x', '^0.0.1', '0.0.2 - 0.0.3', '~0.0.2'];
        it('should sort reverse of ' + arr7.join(' , '), () => {
            checkSortOrder(arr7);
        });
    });

    describe('any version is first', function () {
        const arr1 = ['*', '0.0.0'];
        it('should sort reverse of ' + arr1.join(' , '), () => {
            checkSortOrder(arr1);
        });
        const arr2 = ['*', '0.0.0'];
        it('should sort reverse of ' + arr2.join(' , '), () => {
            checkSortOrder(arr2);
        });
    });
});
