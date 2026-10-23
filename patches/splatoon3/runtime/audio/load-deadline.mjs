// Bound external I/O without admitting a late result into the active sample bank.
// decodeAudioData itself cannot be cancelled; a timed-out result is discarded.
export function audioLoadDeadline(operation, milliseconds = 8000, label = 'Recorded audio load timed out') {
  let timer;
  return Promise.race([
    Promise.resolve(operation),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}
