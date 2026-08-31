/* ============================================================
   SHEETPOST — renders the operator's legal identity from
   assets/js/config.js into every [data-imprint] slot.
   If the config is not filled in yet, the sentence is omitted
   rather than shown with placeholders. `npm run check` is what
   stops that state from shipping.
   ============================================================ */
(function () {
  'use strict';
  var c = window.SP_CONFIG || {};
  var complete = !!(c.legalName && c.registryNo && c.taxId && c.address);

  function line(lang) {
    if (!complete) return '';
    /* A d.o.o. is a company, not a sole proprietor. Saying the wrong one in a
       public imprint misstates the operator's legal form, so it comes from
       the config rather than being assumed. */
    var doo = String(c.entityForm || 'preduzetnik').toLowerCase() === 'doo';
    if (lang === 'en') {
      return c.legalName + (doo ? ', a company registered with the Serbian Business Registers Agency'
        : ', sole proprietor registered with the Serbian Business Registers Agency')
        + ' (registration no. ' + c.registryNo + ', tax ID ' + c.taxId + '), '
        + c.address + ', ' + (c.countryEn || c.country || '');
    }
    return c.legalName + (doo ? ', spółka wpisana do serbskiego rejestru APR'
      : ', przedsiębiorca wpisany do serbskiego rejestru APR')
      + ' (nr ' + c.registryNo + ', PIB ' + c.taxId + '), '
      + c.address + ', ' + (c.country || '');
  }

  function render() {
    Array.prototype.slice.call(document.querySelectorAll('[data-imprint]')).forEach(function (el) {
      var mode = el.getAttribute('data-imprint');
      if (mode === 'auto') mode = (document.documentElement.getAttribute('data-lang') || 'pl') === 'pl' ? 'pl' : 'en';
      var text = line(mode);
      if (!text) { el.remove(); return; }
      el.textContent = text;
    });
  }
  render();
  if (window.SP_I18N_HOOKS) window.SP_I18N_HOOKS.push(render);

  Array.prototype.slice.call(document.querySelectorAll('[data-config]')).forEach(function (el) {
    var v = c[el.getAttribute('data-config')];
    if (v) el.textContent = v;
  });
})();
