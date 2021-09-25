import 'colors';
import * as CommentJson from 'comment-json';
import * as Diff from 'diff';
import { PortablePath, NodeFS } from '@yarnpkg/fslib';
import { recursivePatchCommentJson } from './recursivePatchCommentJson';
import { isEqual } from 'lodash';

export class Change {
    mergedContent: any;

    private constructor(
        private path: PortablePath,
        private originalFileContents: CommentJson.CommentJSONValue,
        intendedContents: object,
    ) {
        const contentCopy = CommentJson.parse(
            CommentJson.stringify(originalFileContents),
        );
        this.mergedContent = recursivePatchCommentJson(
            contentCopy,
            intendedContents,
        );
    }

    public static async againstDisk(
        path: PortablePath,
        intendedContents: object,
    ): Promise<Change> {
        try {
            const content = await new NodeFS().readFilePromise(path, 'utf-8');
            return new Change(path, content, intendedContents);
        } catch {
            return new Change(path, CommentJson.parse('{}'), intendedContents);
        }
    }

    public static againstString(
        path: PortablePath,
        baseContents: string,
        intendedContents: object,
    ): Change {
        try {
            return new Change(path, baseContents, intendedContents);
        } catch {
            return new Change(path, CommentJson.parse('{}'), intendedContents);
        }
    }

    public isEmpty(): boolean {
        return isEqual(this.mergedContent, this.originalFileContents);
    }

    public getTextDiff(): string {
        const originalText = CommentJson.stringify(
            this.originalFileContents,
            null,
            4,
        );
        const mergedText = CommentJson.stringify(this.mergedContent, null, 4);
        if (originalText !== mergedText) {
            let out: string[] = [];
            const diff = Diff.diffLines(originalText, mergedText);
            for (let part of diff) {
                // green for additions, red for deletions
                // grey for common parts
                const color = part.added
                    ? 'green'
                    : part.removed
                    ? 'red'
                    : 'grey';
                out.push(part.value[color]);
            }
            return out.join('\n');
        } else {
            return '';
        }
    }

    public async write(): Promise<void> {
        return new NodeFS().writeFilePromise(
            this.path,
            CommentJson.stringify(this.mergedContent, null, 4),
            'utf-8',
        );
    }
}
