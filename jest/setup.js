const _randomSource = {
    getRandomValues: arr => require('crypto').randomBytes(arr.length),
};
Object.defineProperty(global, 'crypto', {
    value: _randomSource,
});
