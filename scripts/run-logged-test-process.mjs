import fs from 'node:fs';
import { spawn } from 'node:child_process';

// Preserve progress before the child exits, including on a CI cancellation.
// The caller owns the persistent directory and the ordinary test exit policy.
export async function runLoggedTestProcess(executable, args, {
  cwd, env, logFile, stdout = process.stdout, stderr = process.stderr,
}) {
  const fd = fs.openSync(logFile, 'w');
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
      const record = (sink, chunk) => { fs.writeSync(fd, chunk); sink.write(chunk); };
      child.stdout.on('data', chunk => record(stdout, chunk));
      child.stderr.on('data', chunk => record(stderr, chunk));
      child.once('error', reject);
      child.once('close', (status, signal) => resolve({ status, signal }));
    });
  } finally {
    fs.closeSync(fd);
  }
}
