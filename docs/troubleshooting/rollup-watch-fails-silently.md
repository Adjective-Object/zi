# Rollup Watch Fails Silently

Sometimes when you run `rollup -wc`, it will exit with exit code 0 and no error message printed to console.

This may be because something else is holding the port that rollup serves static files on when it boots (port 10001). That is usually a stalled or zombie process of the last launch of rollup still holding on to the port.

If you still run into the issue after running `killall node` (or maybe something less destructive to clean up your process tree), you can debug why it is crashing by running the `Debug rollup` task from `launch.json` in vscode.
