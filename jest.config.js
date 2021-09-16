module.exports = {
    resolver: require.resolve(`jest-pnp-resolver`),
    transform: {
        '.(ts|tsx)$': 'ts-jest',
    },
    testRegex: 'packages.*(/__tests__/.*|\\.(test|spec))\\.(ts|tsx|js)$',
    verbose: true,
    moduleFileExtensions: ['ts', 'tsx', 'js'],
    moduleNameMapper: {
        '\\.(css)$': '<rootDir>/__mocks__/styleMock.js',
    },
    // setupFiles: ['<rootDir>/jest/setup.ts'],
};
