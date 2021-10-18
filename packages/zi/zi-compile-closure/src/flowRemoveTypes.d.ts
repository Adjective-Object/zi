declare module 'flow-remove-types' {
    type FlowOptions = {
        pretty?: boolean;
    };

    type RemoveTypesResult = {
        toString(): string;
    };

    export default function (
        body: string,
        options?: FlowOptions,
    ): RemoveTypesResult;
}
