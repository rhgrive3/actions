const INSTALLED = Symbol.for('inkwave.issue-five.hotfix-c');

export function installIssueFiveHotfixC({ WeaponRunner }) {
  const wr = WeaponRunner.prototype;
  if (wr[INSTALLED]) return;
  Object.defineProperty(wr, INSTALLED, { value: true });
  // #1038: select the full-shot funding threshold in the native charge owner.
  // Scaling dt in an outer grounded-only wrapper bypassed the airborne minimum
  // segment and required rewinding payment/completion clocks on a fresh start.
  // One owner now combines low-ink and airborne rates without multiplying them.
  Object.defineProperty(wr, 's3ChargerFullInkBudget', { value: true });
}
