import path = require('path');
import { slash } from '../../../nodejs/mod-slash/lib';

export function normalizePath(p: string) {
    return slash(path.relative(process.cwd(), p));
}
