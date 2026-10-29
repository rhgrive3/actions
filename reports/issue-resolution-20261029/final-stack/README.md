# Final aggregate local evidence

The planned integration stack is #1908 → #1910 GPU lifecycle → #1909 Rainmaker → #1907 optimized → #1911. The actual aggregate runtime execution head was `5cb10df086b61b9becdb33330e895c5b5e2f41f3`. Candidate `9ef3385a4970c94e915784343e082b9112250e7d` differs from it only in `reports/`, as confirmed by a Git diff excluding that directory. The build and tests below bind these source snapshots; they do not claim that a later report or future commit was executed.

The aggregate site was verified before and after the required 23-file emitted selection: content SHA-256 `296f7cc7218d64e3b0285aa97581669aed7d2a46cc27fa4ecd2aec0c51dd0607`, input SHA-256 `80d7a8e74f0e4ff4fdc69bfdd86b13459251c7a15737b7244e528deed42d3e07`, 2,241 artifacts and 1,530 inputs. Both identity readbacks agree. The selected test-source hashes and frozen corpus hash were unchanged during execution. The gate exited 0: **212/212 passed**, no failures or skips (147 top-level and 65 nested tests). The exact selection, source hashes, command, raw TAP, before/after verifications and state are in [evidence](evidence/) and hashed in [ledger.json](ledger.json).

Separate local runs on the aggregate build exited 0: verifier 660 passed of 661 with one existing optional emitted-pack case skipped; memory 99/99; emitted contact 61/61; packaging 14/14. Their scopes overlap the required gate and each other, so do not add these counts. The skipped verifier case remains recorded as a skip. A separate emitted-props run passed 4/4, including the emitted case corresponding to that skip; its other three source cases overlap the verifier.

Three final builds have complete input/artifact verification and passed deterministic startup file/dependency budgets:

| Candidate | Source commit | Content hash prefix | Input hash prefix | Artifacts / inputs |
| --- | --- | --- | --- | ---: |
| PR #1909 | `e8a556a1` | `e39af4e0` | `58025313` | 2241 / 1529 |
| PR #1907 optimized | `2c6aaa2a` | `be217ec3` | `6d31389d` | 2241 / 1530 |
| PR #1911 aggregate | `9ef3385a` | `296f7cc7` | `80d7a8e7` | 2241 / 1530 |

Full identities, budget and build logs are included in the ledger. Startup gates measure deterministic file/dependency budgets, not browser frame time.

Earlier component receipts remain in [PR #1911 semantic integration](../pr1911-semantic/README.md) and [post-GPU merge](../pr1911-semantic/POST_GPU.md): the native source suite had 633 passes and 128 existing optional original-asset skips, while overlapping source unions passed 156, 73 and 139 cases. The missing original assets remain a real limitation. The bounded owned capsule normal and Rainmaker rounding regressions, their negative controls and compatibility scope are recorded in [optimized ownership and radius](../optimized-owned-radius/README.md). Those earlier source results have their own identities and are not recast as new aggregate executions.

Hosted root `0870fb87` had 308/308 contract checks; hosted CI for the final five-branch heads remains pending. Explosher's 14-frame warmup nondeterminism is under source audit and is not marked resolved. #1665 and #1666 remain open because the mandatory production authority boundary is not installed; #735's native cutoff remains unknown. Existing MOV-08b and Character QA holds remain, and #401 is outside this stack. This evidence does not establish device performance, Nintendo behavior equivalence or a main-branch merge.
