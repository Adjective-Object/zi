export function getClosureUrl(state: { baseUrl: string }): string {
    return new URL('/zi-closure', state.baseUrl).toString();
}
