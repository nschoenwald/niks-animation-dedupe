const ID = 'niks-animation-dedupe';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CHOICES = { blfx: 'NAD.Settings.Priority.Blfx', aa: 'NAD.Settings.Priority.AA' };

/**
 * Per-name priority: a list of item, effect or condition names / identifiers, each with the module
 * that plays for it, overriding the global Priority setting.
 */
export default class OverridesConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${ID}-overrides`,
    tag: 'form',
    classes: ['nad-overrides-config'],
    window: {
      title: 'NAD.Overrides.Title',
      icon: 'fa-solid fa-list',
      contentClasses: ['standard-form'],
    },
    position: { width: 520 },
    form: {
      handler: OverridesConfig.#onSubmit,
      closeOnSubmit: true,
    },
    actions: {
      add: OverridesConfig.#onAdd,
      remove: OverridesConfig.#onRemove,
    },
  };

  static PARTS = {
    body: { template: `modules/${ID}/templates/overrides-config.hbs`, scrollable: [''] },
    footer: { template: 'templates/generic/form-footer.hbs' },
  };

  /** @override */
  async _prepareContext(options) {
    const global = game.settings.get(ID, 'priority');
    const rows = (game.settings.get(ID, 'overrides') ?? []).map(o => ({ match: o.match, priority: o.priority }));
    return {
      rows,
      choices: CHOICES,
      // A new row starts with the module the global setting doesn't pick.
      newPriority: global === 'aa' ? 'blfx' : 'aa',
      globalLabel: CHOICES[global] ?? CHOICES.blfx,
      buttons: [{ type: 'submit', icon: 'fa-solid fa-floppy-disk', label: 'SETTINGS.Save' }],
    };
  }

  #refreshEmpty() {
    const empty = !this.element.querySelector('.nad-override-list .nad-override');
    this.element.querySelector('.nad-override-empty').hidden = !empty;
  }

  static #onAdd() {
    const row = this.element.querySelector('template.nad-override-template').content.firstElementChild.cloneNode(true);
    this.element.querySelector('.nad-override-list').append(row);
    this.#refreshEmpty();
    row.querySelector('input').focus();
  }

  static #onRemove(event, target) {
    target.closest('.nad-override').remove();
    this.#refreshEmpty();
  }

  static async #onSubmit(event, form) {
    const rows = [...form.querySelectorAll('.nad-override-list .nad-override')]
      .map(li => ({
        match: li.querySelector('[name="match"]').value.trim(),
        priority: li.querySelector('[name="priority"]').value,
      }))
      .filter(r => r.match && r.priority in CHOICES);
    await game.settings.set(ID, 'overrides', rows);
  }
}
