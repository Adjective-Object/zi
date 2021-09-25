import semver from 'semver';
// adapted from https://github.com/willfarrell/node-semver-compare-range/blob/master/index.js

function compareSingleVersionToRange(version: string, range: string): 1 | -1 {
    if (semver.gtr(version, range)) {
        return 1;
    } else if (semver.ltr(version, range)) {
        return -1;
    }

    if (range === '*') {
        return 1;
    }

    const rangeMin = semver.minVersion(range);
    if (semver.eq(version, rangeMin)) {
        return -1;
    }
    return 1;
}

function compareRangeToRange(aRange: string, bRange: string): 1 | -1 | 0 {
    if (aRange === bRange) {
        // short circuit exact string equality
        // (don't parse versions first)
        return 0;
    } else if (bRange === '*') {
        return 1;
    } else if (aRange === '*') {
        return -1;
    }
    const aMin = semver.minVersion(aRange);
    const bMin = semver.minVersion(bRange);

    // compare based on min legal versions
    if (semver.gt(aMin, bMin)) {
        return 1;
    } else if (semver.lt(aMin, bMin)) {
        return -1;
    }

    const aRangeLarger = semver.subset(bRange, aRange);
    const bRangeLarger = semver.subset(aRange, bRange);
    if (aRangeLarger && bRangeLarger) {
        // If the ranges are mutual non-strict subsets,
        // they must be equal
        return 0;
    } else if (aRangeLarger) {
        return 1;
    } else if (bRangeLarger) {
        return -1;
    }

    // otherwise they are _exactly_ equal.
    return 0;
}

export function compareSemver(a: string, b: string): 1 | -1 | 0 {
    const aAsSemver = semver.valid(a);
    const bAsSemver = semver.valid(b);

    if (aAsSemver && bAsSemver) {
        return semver.compare(aAsSemver, bAsSemver);
    }

    // semver.validRange returns a range of form <= or >=, which
    // will discard hyphen ranges.
    //
    // Preserve the original strings here if they can be parsed
    // to ranges
    const aAsRange = !aAsSemver && semver.validRange(a) ? a : null;
    const bAsRange = !bAsSemver && semver.validRange(b) ? b : null;

    if (aAsRange && bAsRange) {
        return compareRangeToRange(aAsRange, bAsRange);
    }
    if (aAsSemver && bAsRange) {
        return compareSingleVersionToRange(aAsSemver, bAsRange);
    }
    if (bAsSemver && aAsRange) {
        return -compareSingleVersionToRange(bAsSemver, aAsRange) as -1 | 1;
    }

    const invalidRanges = [a, b].filter(
        (x) => !semver.valid(x) && !semver.validRange(x),
    );

    // neither string was a valid semver or a valid range
    throw new Error(
        `invalid semver ranges or version specified: ${invalidRanges}`,
    );
}
