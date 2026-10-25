// Multi-step quote request.
import { $, $$ } from '../core.js';
export default function () {
  const form = $('[data-quote-form]');
  const steps = $$('[data-step]', form), dots = $$('.steps-indicator span');
  let cur = 0;
  const qs = new URLSearchParams(location.search);
  if (qs.get('segment')) { const r = form.querySelector(`input[name="segment"][value="${qs.get('segment')}"]`); if (r) r.checked = true; }
  if (qs.get('package')) { const s = $('#q-pkg'); const v = qs.get('package'); if (![...s.options].some((o) => o.text === v)) s.add(new Option(v, v)); s.value = v; }
  if (qs.get('product')) $('#q-load').value = `Interested in: ${qs.get('product')} (with installation)`;
  if (qs.get('kind') === 'maintenance') $('#q-int').value = 'Maintenance or repair';
  form.dataset.extra = JSON.stringify({ kind: qs.get('kind') === 'maintenance' ? 'maintenance' : 'quote' });
  const go = (i) => {
    if (i > cur) {
      const bad = [...steps[cur].querySelectorAll('input,select,textarea')].find((el) => el.required && !el.checkValidity());
      if (bad) { bad.reportValidity(); return; }
    }
    cur = i;
    steps.forEach((s, j) => (s.hidden = j !== i));
    dots.forEach((d, j) => d.classList.toggle('on', j <= i));
    steps[i].querySelector('input:not([type=radio]),select,textarea,input')?.focus();
  };
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) go(cur + 1);
    if (e.target.closest('[data-prev]')) go(cur - 1);
  });
}
