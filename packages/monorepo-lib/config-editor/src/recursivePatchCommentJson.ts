import * as CommentJson from 'comment-json';
import isEqual from 'lodash/isEqual';

export function recursivePatchCommentJson(
    target: CommentJson.CommentJSONValue,
    edit: Record<string, any> | Array<any>,
) {
    const keys = Object.keys(edit) as (keyof typeof edit)[];
    const primitiveKeys = keys.filter(
        (k) => !(edit[k as keyof typeof edit] instanceof Object),
    );
    const primitiveDifferentKeys = primitiveKeys.filter(
        (a) => target[a] !== edit[a],
    );
    CommentJson.assign(target, edit, primitiveDifferentKeys);

    const arrayKeys = keys.filter((k) => Array.isArray(edit[k]));
    for (let k of arrayKeys) {
        let oldArr = target[k];
        let newArr = edit[k];
        if (!oldArr || !Array.isArray(oldArr)) {
            target = edit[k];
            continue;
        } else {
            for (
                let iOld = 0, iNew = 0;
                iOld < oldArr.length || iNew < newArr.length;

            ) {
                if (iOld >= oldArr.length) {
                    oldArr.push(newArr[iNew]);
                    iOld++;
                    iNew++;
                } else if (iNew >= newArr.length) {
                    oldArr.splice(iOld, 1);
                }
                if (isEqual(oldArr[iOld], newArr[iNew])) {
                    // match -- do not mutate the old element
                    iOld++;
                    iNew++;
                } else {
                    const isInsert = newArr
                        .slice(iNew)
                        .some((futureNew: any) =>
                            isEqual(futureNew, oldArr[iOld]),
                        );
                    if (isInsert) {
                        // insert the new element before the current element
                        oldArr.splice(iOld, 0, newArr[iNew]);
                        iOld++;
                        iNew++;
                    } else {
                        // delete current element form the old array
                        oldArr.splice(iOld, 1);
                        iNew++;
                    }
                }
            }
        }
    }

    const objectKeys = keys.filter(
        (k) => !primitiveKeys.includes(k) && !arrayKeys.includes(k),
    );
    for (let complexKey of objectKeys) {
        if (target.hasOwnProperty(complexKey)) {
            recursivePatchCommentJson(target[complexKey], edit[complexKey]);
        } else [(target[complexKey] = edit[complexKey])];
    }

    return target;
}
