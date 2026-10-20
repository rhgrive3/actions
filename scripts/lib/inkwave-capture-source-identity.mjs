import { execFileSync } from 'node:child_process';

// Resolve the harness checkout once. GITHUB_SHA can be a synthetic PR merge,
// so preserve it separately and never substitute it for an unreadable HEAD.
export function captureSourceIdentity({ cwd, env = process.env, readHead = () =>
  execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
  }) } = {}) {
  const eventSha = typeof env.GITHUB_SHA === 'string' && env.GITHUB_SHA ? env.GITHUB_SHA : null;
  try {
    const checkoutSha = String(readHead()).trim();
    if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(checkoutSha)) {
      return { checkoutSha: null, eventSha, checkoutIdentityStatus: 'invalid-head' };
    }
    return { checkoutSha: checkoutSha.toLowerCase(), eventSha, checkoutIdentityStatus: 'verified-git-head' };
  } catch {
    return { checkoutSha: null, eventSha, checkoutIdentityStatus: 'unavailable' };
  }
}
