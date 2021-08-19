# Objects as Input Types

By default, the object type is banned by
`@typescript-eslint/ban-types`, and `Record<string, unknown>` is preferred.

`Record<string, unknown>` requires an index type, which [by design do not exist on interfaces](https://github.com/Microsoft/TypeScript/issues/15300#issuecomment-332366024).

However, type aliases do not have names in error messages, so we generally prefer interfaces over types, and stub out this eslint error when we need to restrict a generic parameter to 'an object', or take a generic object as input.
