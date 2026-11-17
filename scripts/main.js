/**
 * Nik's Animation Dedupe
 *
 * Listens to Automated Animations' "AutomatedAnimations-WorkflowStart" hook and vetoes the
 * A-A workflow (clonedData.stopWorkflow = true) whenever Boss Loot FX will play its own
 * animation for the same item / activity / active effect.
 *
 * Instead of copying BLFX's lookup tables, it asks BLFX's own BlfxMacroExecutor class, loaded
 * from the exact URL BLFX already loaded, so the browser hands back the same module instance.
 */

const ID = 'niks-animation-dedupe';
const BLFX = 'boss-loot-assets-premium';
const AA = 'autoanimations';

// BLFX trigger names an Automated Animations workflow can collide with, per A-A entry point.
const ITEM_TRIGGERS = ['afterItemUse', 'postUseActivity', 'afterAttack', 'afterThrown', 'afterDamage', 'createTemplate', 'afterSummon'];

// Mirrors CONDITION_ANIMATIONS in BLFX macros/spell/spellMacro.js (addConditionAnimation).
const BLFX_CONDITIONS = new Set([
  'blinded', 'charmed', 'confused', 'deafened', 'frightened', 'grappled', 'incapacitated',
  'restrained', 'paralyzed', 'petrified', 'poisoned', 'silenced', 'stunned', 'unconscious',
]);

let blfx = null; // { BlfxMacroExecutor, TRIGGER_MAP }

const log = (...args) => {
  if (game.settings.get(ID, 'debug')) console.log(`${ID} |`, ...args);
};

/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

Hooks.once('init', () => {
  game.settings.register(ID, 'enabled', {
    name: 'NAD.Settings.Enabled.Name',
    hint: 'NAD.Settings.Enabled.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(ID, 'matchMode', {
    name: 'NAD.Settings.MatchMode.Name',
    hint: 'NAD.Settings.MatchMode.Hint',
    scope: 'world',
    config: true,
    type: String,
    choices: { activity: 'NAD.Settings.MatchMode.Activity', trigger: 'NAD.Settings.MatchMode.Trigger' },
    default: 'activity',
  });
  game.settings.register(ID, 'debug', {
    name: 'NAD.Settings.Debug.Name',
    hint: 'NAD.Settings.Debug.Hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
  });
});

Hooks.once('ready', async () => {
  if (!game.modules.get(BLFX)?.active || !game.modules.get(AA)?.active) return;

  blfx = await loadBlfx();
  if (!blfx) return;

  Hooks.on('AutomatedAnimations-WorkflowStart', onWorkflowStart);
  game.modules.get(ID).api = { blfxWillAnimate, blfxWillAnimateEffect };
  console.log(`${ID} | Ready: Automated Animations will be skipped where BLFX animates.`);
});

/**
 * Import BLFX's executor from the URL BLFX's own module graph used.
 * helperFunctions.js imports bossLootFx.js, so importing from a *different* URL would run BLFX a
 * second time and register its hooks twice. To rule that out, only an already-loaded URL is used.
 */
async function loadBlfx() {
  const suffix = `/modules/${BLFX}/scripts/apps/BlfxMacroExecutor.js`;
  const candidates = [];

  const entry = [...document.querySelectorAll('script[type="module"][src]')]
    .find(s => new URL(s.src, document.baseURI).pathname.endsWith(`/modules/${BLFX}/scripts/bossLootFx.js`));
  if (entry) candidates.push(new URL('./apps/BlfxMacroExecutor.js', new URL(entry.src, document.baseURI)).href);

  for (const r of performance.getEntriesByType('resource')) {
    const url = new URL(r.name);
    if (url.pathname.endsWith(suffix)) candidates.push(url.href);
  }

  const url = candidates[0];
  if (!url) {
    console.warn(`${ID} | Could not find where BLFX was loaded from; doing nothing, so Automated Animations is unaffected.`);
    return null;
  }

  try {
    const [executor, constants] = await Promise.all([
      import(url),
      import(new URL('../constants.js', url).href),
    ]);
    if (typeof executor.BlfxMacroExecutor?.getAutoRecognitionAnimation !== 'function' || !constants.TRIGGER_MAP) {
      throw new Error('BLFX internals have changed (BlfxMacroExecutor / TRIGGER_MAP not found)');
    }
    return { BlfxMacroExecutor: executor.BlfxMacroExecutor, TRIGGER_MAP: constants.TRIGGER_MAP };
  } catch (err) {
    console.warn(`${ID} | Could not read BLFX's animation logic; doing nothing, so Automated Animations is unaffected.`, err);
    return null;
  }
}

/* -------------------------------------------- */
/*  A-A hook                                    */
/* -------------------------------------------- */

function onWorkflowStart(data, animationData) {
  if (!animationData) return; // A-A has nothing to play anyway
  if (!game.settings.get(ID, 'enabled')) return;

  // A-A awaits these before checking stopWorkflow, which lets the check be async.
  (data.deferrals ??= []).push(
    decide(data)
      .then(skip => {
        if (skip) data.stopWorkflow = true;
        log(skip ? 'Skipping A-A (BLFX animates this):' : 'Allowing A-A:', data.item?.name, data);
      })
      .catch(err => console.warn(`${ID} | Check failed, letting Automated Animations play.`, err))
  );
}

async function decide(data) {
  if (data.activeEffect) return blfxWillAnimateEffect(data.item);

  const item = data.item;
  const activity = data.activity ?? null;
  const roll = data.rollAttackHook?.roll;

  let triggers;
  if (game.settings.get(ID, 'matchMode') === 'trigger') {
    if (data.rollAttackHook) triggers = ['afterAttack', 'afterThrown'];
    else if (data.rollDamageHook) triggers = ['afterDamage'];
    else if (data.isTemplate) triggers = ['createTemplate'];
    else if (data.useItemHook) triggers = ['afterItemUse', 'postUseActivity'];
    else if (activity?.type === 'summon') triggers = ['afterSummon'];
    else triggers = ITEM_TRIGGERS;
  } else {
    triggers = ITEM_TRIGGERS;
  }

  return blfxWillAnimate(item, activity, triggers, roll);
}

/* -------------------------------------------- */
/*  BLFX prediction                             */
/* -------------------------------------------- */

/**
 * Would BLFX play something for this item/activity on any of the given triggers?
 * Follows BlfxMacroExecutor.callMacro → executeAutomaticRecognition step by step.
 */
export async function blfxWillAnimate(item, activity, triggers, roll) {
  const X = blfx.BlfxMacroExecutor;
  if (!(item instanceof Item) || !item.isEmbedded) return false; // BLFX ignores unowned items
  if (!game.modules.get('sequencer')?.active) return false;
  if (X.isDnDVersion4() && !activity) return false;

  for (const trigger of triggers) {
    // 1) A custom animation made in the BLFX Animation Editor.
    //    If one exists for the activity, BLFX never falls back to auto-recognition for it.
    const script = X.getMacroScript(item, trigger, activity);
    if (script) {
      if (!activity) return true;
      const flags = foundry.utils.getProperty(item, `flags.${BLFX}`) ?? {};
      const eventType = flags[activity.id]?.eventType ?? flags[activity.name]?.eventType;
      if (blfx.TRIGGER_MAP[eventType] === trigger) return true;
      continue;
    }

    // 2) BLFX auto-recognition.
    if (!X.isAutoRecognitionEnabled(item, trigger, activity)) continue;
    const ar = await X.getAutoRecognitionAnimation({ item, roll, activity, trigger });
    if (!(ar?.macro instanceof Function)) continue; // includes Custom Auto-Rec "blocker" entries
    const only = ar.defaultParams?.playOnlyForActivityType;
    if (only && activity && only !== activity.type) continue;
    return true;
  }
  return false;
}

/** Would BLFX play something when this active effect is created? (BLFX hooks.js _afterActiveEffect) */
export async function blfxWillAnimateEffect(effect) {
  if (!effect) return false;
  const item = await originItem(effect);

  if (!(item instanceof Item)) {
    // Status conditions: BLFX plays its own condition animations if enabled.
    if (!game.settings.get(BLFX, 'blfxConditionAnimation')) return false;
    if (!game.modules.get('sequencer')?.active) return false;
    const condition = effect.statuses?.first?.() ?? slugify(effect.name);
    return BLFX_CONDITIONS.has(condition);
  }

  const activity = await originActivity(item, effect);
  return blfxWillAnimate(item, activity, ['afterActiveEffects']);
}

// Same resolution order as BLFX hooks.js getItem()
async function originItem(effect) {
  if (effect.statuses?.has?.('concentrating')) return null;
  const uuid = effect.system?.origin?.activity ?? effect.system?.origin?.item ?? effect._source?.origin;
  const origin = uuid ? await fromUuid(uuid) : null;
  const source = origin?.parent;
  if (origin?.item instanceof Item) return origin.item;
  if (source instanceof Item) return source;
  if (origin instanceof Item) return origin;
  if (source instanceof Actor) {
    const sourceItem = origin._source?.origin ? await fromUuid(origin._source.origin) : null;
    if (sourceItem instanceof Item) return sourceItem;
    return source.items?.getName(effect.name) ?? null;
  }
  if (source instanceof ActiveEffect) return source.getSource();
  const itemUuid = foundry.utils.getProperty(effect, `flags.${BLFX}.blfxCustom.originItem`);
  const item = itemUuid ? await fromUuid(itemUuid) : null;
  return item instanceof Item ? item : null;
}

// Same resolution order as BLFX hooks.js getActivity()
async function originActivity(item, effect) {
  if (foundry.utils.isNewerVersion(game.system.version, '6.0')) {
    const uuid = effect.system?.origin?.activity;
    if (uuid) return fromUuid(uuid);
  }
  for (const activity of item.system.activities?.contents ?? []) {
    if (activity.effects?.some(e => e.effect?.name === effect.name)) return activity;
  }
  const uuid = foundry.utils.getProperty(effect, `flags.${BLFX}.blfxCustom.originActivity`);
  return uuid ? fromUuid(uuid) : null;
}

// Same as BLFX helperFunctions.slugify
function slugify(input) {
  if (!input) return '';
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).join('-');
}
