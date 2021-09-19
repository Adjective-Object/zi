import { recursivePatchCommentJson } from '../recursivePatchCommentJson';
import CommentJson from 'comment-json';

describe('recursivePatchCommentJson', () => {
    it('Preserves comments on an identical object', () => {
        expect(
            CommentJson.stringify(
                recursivePatchCommentJson(
                    CommentJson.parse(
                        `{
                            // hello
                            "a": 1,
                            // goodbye
                            "b": 2
                        }`,
                    ),

                    {
                        a: 1,
                        b: 2,
                    },
                ),

                null,
                4,
            ),
        ).toMatchInlineSnapshot(`
            "{
                // hello
                \\"a\\": 1,
                // goodbye
                \\"b\\": 2
            }"
        `);
    });

    it('Preserves comments when replacing a key in an object', () => {
        expect(
            CommentJson.stringify(
                recursivePatchCommentJson(
                    CommentJson.parse(
                        `{
                            // hello
                            "a": 1,
                            // goodbye
                            "b": 2
                        }`,
                    ),
                    {
                        a: 'a',
                    },
                ),

                null,
                4,
            ),
        ).toMatchInlineSnapshot(`
            "{
                // hello
                \\"a\\": \\"a\\",
                // goodbye
                \\"b\\": 2
            }"
        `);
    });

    it('Preserves comments on objects when recursing into them', () => {
        expect(
            CommentJson.stringify(
                recursivePatchCommentJson(
                    CommentJson.parse(
                        `{
                            // hello
                            "a": {
                                // hewwo
                                "b": 1,
                                // goodbye
                                "c": {
                                    // good-bye
                                    "d": {}
                                }    
                            },
                        }`,
                    ),

                    {
                        a: {
                            c: {
                                e: 'hello again',
                            },
                        },
                    },
                ),

                null,
                4,
            ),
        ).toMatchInlineSnapshot(`
            "{
                // hello
                \\"a\\": {
                    // hewwo
                    \\"b\\": 1,
                    // goodbye
                    \\"c\\": {
                        // good-bye
                        \\"d\\": {},
                        \\"e\\": \\"hello again\\"
                    }
                }
            }"
        `);
    });

    it('Preserves comments on objects when replacing them', () => {
        expect(
            CommentJson.stringify(
                recursivePatchCommentJson(
                    CommentJson.parse(
                        `{
                            // hello
                            "a": {},
                        }`,
                    ),

                    {
                        a: 1,
                    },
                ),

                null,
                4,
            ),
        ).toMatchInlineSnapshot(`
            "{
                // hello
                \\"a\\": 1
            }"
        `);
    });

    it('Preserves comments on array members when inserting', () => {
        expect(
            CommentJson.stringify(
                recursivePatchCommentJson(
                    CommentJson.parse(
                        `{ "arr": [
                            // a
                            "a",
                            // b
                            "b",
                            // c
                            "c",
                        ]}`,
                    ),
                    { arr: ['d', 'a', 'b', 'b', 'c', 'f'] },
                ),

                null,
                4,
            ),
        ).toMatchInlineSnapshot(`
            "{
                \\"arr\\": [
                    \\"d\\",
                    // a
                    \\"a\\",
                    // b
                    \\"b\\",
                    \\"b\\",
                    // c
                    \\"c\\",
                    \\"f\\"
                ]
            }"
        `);
    });

    it('Deletes array elements not in the target array', () => {
        expect(
            CommentJson.stringify(
                recursivePatchCommentJson(
                    CommentJson.parse(
                        `{ "arr": [
                            // a
                            "a",
                            // b
                            "b",
                            // c
                            "c",
                        ]}`,
                    ),

                    { arr: ['a'] },
                ),

                null,
                4,
            ),
        ).toMatchInlineSnapshot(`
            "{
                \\"arr\\": [
                    // a
                    \\"a\\"
                ]
            }"
        `);
    });

    it('Preserves comments on objects in the target array', () => {
        expect(
            CommentJson.stringify(
                recursivePatchCommentJson(
                    CommentJson.parse(
                        `{ "arr": [
                            // a
                            {
                                "a": 1
                            },
                            // b
                            "b",
                        ]}`,
                    ),

                    { arr: ['_', { a: 1 }, 'b'] },
                ),

                null,
                4,
            ),
        ).toMatchInlineSnapshot(`
            "{
                \\"arr\\": [
                    \\"_\\",
                    // a
                    {
                        \\"a\\": 1
                    },
                    // b
                    \\"b\\"
                ]
            }"
        `);
    });

    it('Preserves comments on multiple equal objects in the target array', () => {
        expect(
            CommentJson.stringify(
                recursivePatchCommentJson(
                    CommentJson.parse(
                        `{ "arr": [
                            // a
                            {
                                "a": 1
                            },
                            // b
                            "b",
                            // eh
                            {
                                "a": 1
                            },
                        ]}`,
                    ),

                    { arr: ['_', { a: 1 }, 'b', 'd', { a: 1 }] },
                ),

                null,
                4,
            ),
        ).toMatchInlineSnapshot(`
            "{
                \\"arr\\": [
                    \\"_\\",
                    // a
                    {
                        \\"a\\": 1
                    },
                    // b
                    \\"b\\",
                    \\"d\\",
                    // eh
                    {
                        \\"a\\": 1
                    }
                ]
            }"
        `);
    });
});
