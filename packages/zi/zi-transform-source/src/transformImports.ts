import { Project, SourceFile, ts } from 'ts-morph';
import {
    createExpressionStatement,
    createFunctionExpression,
    createImportDeclaration,
    createStringLiteral,
    isImportDeclaration,
} from 'typescript';

export function transformImports(
    functionName: string,
    sourceString: string,
    replacementMap: Map<string, string>,
) {
    const project = new Project();
    const sourceFile: SourceFile = project.createSourceFile(
        'temp.ts',
        sourceString,
    );

    sourceFile.transform((traversal) => {
        const node = traversal.visitChildren(); // Here travseral visits children in postorder
        if (isImportDeclaration(node)) {
            const specifier = node.moduleSpecifier;
            if (!ts.isStringLiteral(specifier)) {
                console.warn(
                    'detected import with dynamic moduleSpecifier! cannot be hijacked',
                    specifier,
                );
                return node;
            } else {
                const newSpecifier = replacementMap.get(specifier.text);
                if (typeof newSpecifier === 'string') {
                    return createExpressionStatement(
                        createCall()
                        node.decorators,
                        node.modifiers,
                        node.importClause,
                        createStringLiteral(newSpecifier),
                    );
                } else {
                    return node;
                }
            }
        } else {
            return node;
        }
    });

    return sourceFile.getFullText();
}


export function convertImportToCall(functionName: string, newImportName: string)