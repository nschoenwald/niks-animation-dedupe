// Node loader hooks: swap two heavy A-A modules (database lookup, Sequencer helpers) for stubs,
// so the real AAHandler.make() from autoanimations/src/system-handlers/workflow-data.js can run.
const STUBS = {
  'findAnimation.js': `export async function handleItem(data) { return globalThis.__aaAnimationData ?? null; }`,
  'commonSequences.js': `export const sourceEffect = () => {}, secondaryEffect = () => {}, targetEffect = () => {}, macroSection = () => {};`,
};

export async function resolve(specifier, context, next) {
  const result = await next(specifier, context);
  if (result.url.includes('/autoanimations/src/system-handlers/')) {
    const file = result.url.split('/').pop();
    if (STUBS[file]) return { url: `data:text/javascript,${encodeURIComponent(STUBS[file])}`, shortCircuit: true };
  }
  return result;
}
