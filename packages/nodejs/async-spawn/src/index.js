"use strict";
exports.__esModule = true;
exports.asyncSpawn = void 0;
var child_process_1 = require("child_process");
function asyncSpawn() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    var child = child_process_1.spawn.apply(void 0, args);
    var resolve = null;
    var reject = null;
    child.on('exit', function (exitCode, err) {
        if (err) {
            console.error(err);
            reject(err);
        }
        else {
            resolve(exitCode);
        }
    });
    child.on('error', function (err) {
        reject(err);
    });
    return new Promise(function (res, rej) {
        resolve = res;
        reject = rej;
    });
}
exports.asyncSpawn = asyncSpawn;
