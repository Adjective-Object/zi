export type ZiClosure = {
    /**
     * unique ID of this compiled closure. Not stable against content
     */
    id: string;
    /**
     * Record of relative path : transpiled file content
     */
    closure: Record<string, string>;
};

export function getItemFromClosure(
    closure: ZiClosure,
    path: string,
): string | null {
    return closure.closure[path] ?? null;
}
