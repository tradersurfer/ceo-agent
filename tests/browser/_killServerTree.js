// Shared by every tests/browser/*.test.js file: reliably kills a dev-server
// process spawned with `{ shell: true }` (needed on Windows -- see each
// test file's own spawn comment for why `shell: true` is required there).
//
// `child.kill('SIGTERM')` only signals the shell wrapper process, not the
// real `next dev` grandchild it spawned -- on Windows, that leaves the
// actual server (and its own child compiler workers) running as an orphan,
// still bound to its port. Confirmed directly: after a chained
// `npm run test:browser` run, `netstat -ano` showed the three ports these
// test files use (3997-3999) each still LISTENING, backed by 11
// accumulated orphaned node.exe processes -- which is what made later
// browser-test runs flaky (a stale prior-run server, or genuine resource
// contention from ~11 leftover Node processes, not the test logic itself).
//
// `taskkill /pid <pid> /t /f` (Windows) kills the entire process tree
// rooted at the shell wrapper's PID, not just that one process. POSIX
// platforms use the already-correct `SIGTERM` on the process (not a
// process group, since these tests don't detach one).

function killServerTree(child) {
  if (!child) return;
  if (process.platform === 'win32') {
    // Best-effort: the process may have already exited on its own (or
    // partway through exiting) by the time test.after() runs -- a failed
    // taskkill here must never fail the test teardown itself.
    try {
      require('child_process').execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' });
    } catch {
      // Already gone, or couldn't be killed -- nothing more to do here.
    }
  } else {
    child.kill('SIGTERM');
  }
}

module.exports = { killServerTree };
