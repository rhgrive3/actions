// Self-contained so the exact tested function can execute in the browser realm.
export async function runCaptureGpuLifecycle(operation, cleanupTasks, checkpoint) {
 let result, primary;
 try { result = await operation(); } catch (error) { primary = error; }
 const failures = [];
 for (const cleanup of cleanupTasks) { try { await cleanup(); } catch (error) { failures.push(error); } }
 if (!primary && failures.length === 0) return result;
 let error = primary;
 if (failures.length) error = new AggregateError([...(primary ? [primary] : []), ...failures], 'Capture GPU cleanup failed', primary ? {cause: primary} : undefined);
 const partial = primary?.capturePartial || result?.C || {error: String(primary || failures[0])};
 error.capturePartial = partial;
 try { await checkpoint(partial); } catch (checkpointError) {
  const combined = new AggregateError([error, checkpointError], 'Capture failure checkpoint failed', {cause:error});
  combined.capturePartial = partial; throw combined;
 }
 throw error;
}
