// Stage presentation is prepared before the world transaction commits. The
// synchronous full facade registers the same descriptors for tools/legacy users.
export const STAGES = {};
const pending = new Map();
export function registerStageData(id, descriptor) { STAGES[id] = descriptor; }
export async function prepareStageData(id) {
  if (STAGES[id] || (id !== 'cargo' && id !== 'range')) return;
  let request = pending.get(id);
  if (!request) {
    request = (id === 'cargo' ? import('./cargo/data.js') : import('./range-data.js'))
      .then(module => { registerStageData(id, module.STAGE); })
      .finally(() => pending.delete(id));
    pending.set(id, request);
  }
  await request;
}
