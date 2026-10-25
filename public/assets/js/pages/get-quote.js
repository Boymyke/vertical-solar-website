// Multi-step quote request.
import { $, $$, esc } from '../core.js';
import { placeFields } from '../places.js';

export default function () {
  const form = $('[data-quote-form]');
  if (!form) return;
  const steps = $$('fieldset[data-step]', form), dots = $$('.steps-indicator span');
  const label = $('[data-step-label]');
  let cur = 0;
  const qs = new URLSearchParams(location.search);
  const pick = (sel, v) => { const s = $(sel); if (!s || !v) return; if (![...s.options].some((o) => o.value === v || o.text === v)) s.add(new Option(v, v)); s.value = [...s.options].find((o) => o.value === v || o.text === v).value; };
  if (qs.get('segment')) { const r = form.querySelector(`input[name="segment"][value="${CSS.escape(qs.get('segment'))}"]`); if (r) r.checked = true; }
  pick('#q-pkg', qs.get('package'));
  pick('#q-bat', qs.get('battery'));
  if (qs.get('load')) $('#q-load').value = `I want to power: ${qs.get('load').slice(0, 600)}`;
  if (qs.get('product')) $('#q-load').value = `Interested in: ${qs.get('product')} (with installation)`;
  if (qs.get('kind') === 'maintenance') $('#q-int').value = 'Maintenance or repair';
  form.dataset.extra = JSON.stringify({ kind: qs.get('kind') === 'maintenance' ? 'maintenance' : qs.get('load') ? 'calculator' : 'quote' });
  placeFields(form, $('#q-city'));

  const summary = () => {
    const box = $('[data-q-summary]'); if (!box) return;
    const seg = form.querySelector('input[name="segment"]:checked')?.closest('label')?.querySelector('span')?.childNodes[1]?.textContent?.trim();
    const parts = [seg, $('#q-int').value, $('#q-pkg').value, $('#q-bat').value].filter(Boolean);
    box.hidden = !parts.length;
    box.innerHTML = `<span>Your request:</span>${parts.map((p) => `<span class="chip">${esc(p)}</span>`).join('')}<button type="button" data-goto="0">Change</button>`;
  };
  const go = (i) => {
    if (i > cur) {
      const bad = [...steps[cur].querySelectorAll('input,select,textarea')].find((el) => el.willValidate && !el.checkValidity());
      if (bad) { bad.setAttribute('aria-invalid', 'true'); bad.reportValidity(); return; }
    }
    cur = Math.max(0, Math.min(steps.length - 1, i));
    steps.forEach((s, j) => (s.hidden = j !== cur));
    dots.forEach((d, j) => d.classList.toggle('on', j <= cur));
    if (label) label.textContent = `Step ${cur + 1} of ${steps.length}`;
    if (cur === steps.length - 1) summary();
    const first = steps[cur].querySelector('input:not([type=radio]):not([type=hidden]):not(.hp),select,textarea');
    (first || steps[cur]).focus?.({ preventScroll: true });
    form.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) go(cur + 1);
    if (e.target.closest('[data-prev]')) go(cur - 1);
    const g = e.target.closest('[data-goto]'); if (g) go(Number(g.dataset.goto));
  });
  // Enter in a text field moves to the next step instead of submitting early.
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input:not([type=radio])') && cur < steps.length - 1) { e.preventDefault(); go(cur + 1); }
  });
}
