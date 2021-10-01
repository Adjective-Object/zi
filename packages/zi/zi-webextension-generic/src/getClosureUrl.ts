export function getClosureUrl(state: { baseUrl: string }): string {
    return new URL('/zi-closure.json', state.baseUrl).toString();
}
