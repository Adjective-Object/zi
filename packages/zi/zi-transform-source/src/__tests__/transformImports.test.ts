import { transformImports } from '../transformImports';

describe('transformImports', () => {
    it('transforms imports in the import map', () => {
        const importMap = new Map();
        importMap.set('bar', 'barTransformed');
        importMap.set('baz', 'bazTransformed');

        expect(
            transformImports(
                '__zi__',
                `
                import a, { foo } from 'bar';
                import * from 'baz';
                import f from 'bim';`,
                importMap,
            ),
        ).toEqual(`
                const {default: a, foo } = __zi__.require('barTransformed');
                const * = __zi__.require('bazTransformed');
                const f = __zi__.require('bim');`);
    });
});
