const { resolve } = require('path');
const ziPlugin = require('rollup-plugin-zi-import-hijack');

module.exports = {
    base: '/',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
            },
        },
    },
    plugins: [ziPlugin()],
};
