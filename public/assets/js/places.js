// Location search for address inputs: type an area or street, pick a suggestion, and the form gets the
// confirmed place with its coordinates. Used on the website and in the CRM.
//
//   <div class="place-field"><input data-place ...></div>
//   attachPlace(input, { onPick(place) {}, onClear() {} })
//
// place = { label, name, sub, city, state, lat, lng }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let uid = 0;

export function attachPlace(input, { onPick, onClear, endpoint = '/api/public/places' } = {}) {
  if (!input || input.dataset.placeReady) return;
  input.dataset.placeReady = '1';
  const wrap = input.closest('.place-field') || input.parentElement;
  wrap.classList.add('place-field');
  const id = `place-list-${++uid}`;
  const list = document.createElement('ul');
  list.className = 'place-list'; list.id = id; list.setAttribute('role', 'listbox'); list.hidden = true;
  wrap.appendChild(list);
  const status = document.createElement('span');
  status.className = 'place-ok'; status.hidden = true; status.setAttribute('aria-live', 'polite');
  wrap.appendChild(status);
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', id); input.setAttribute('aria-expanded', 'false'); input.autocomplete = 'off';

  let items = [], active = -1, timer = 0, seq = 0, picked = input.dataset.placeVerified === '1' ? input.value : null;
  const open = (v) => { list.hidden = !v; input.setAttribute('aria-expanded', String(v)); };
  const mark = (ok) => {
    status.hidden = !ok;
    status.innerHTML = ok ? '<i class="ri-checkbox-circle-fill" aria-hidden="true"></i> Location confirmed' : '';
    input.dataset.placeVerified = ok ? '1' : '';
  };
  if (picked) mark(true);

  const draw = (msg) => {
    if (msg) { list.innerHTML = `<li aria-disabled="true" style="cursor:default"><i class="ri-search-line" aria-hidden="true"></i><span>${esc(msg)}</span></li>`; open(true); return; }
    list.innerHTML = items.map((p, i) => `<li role="option" id="${id}-${i}" aria-selected="${i === active}" data-i="${i}"><i class="ri-map-pin-2-line" aria-hidden="true"></i><span>${esc(p.name || p.label)}${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</span></li>`).join('');
    input.setAttribute('aria-activedescendant', active >= 0 ? `${id}-${active}` : '');
    open(items.length > 0);
  };
  const choose = (i) => {
    const p = items[i]; if (!p) return;
    input.value = p.label; picked = p.label; input._place = p; open(false); mark(true);
    onPick?.(p);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const search = async () => {
    const q = input.value.trim(), my = ++seq;
    if (q.length < 3) { items = []; open(false); return; }
    draw('Searching…');
    try {
      const r = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`, { headers: { accept: 'application/json' } });
      const d = r.ok ? await r.json() : { items: [] };
      if (my !== seq) return;
      items = d.items || []; active = -1;
      if (!items.length) draw('No match yet — try adding the city, e.g. "Ikeja, Lagos"'); else draw();
    } catch { if (my === seq) draw('Could not search right now. You can still type the address.'); }
  };

  input.addEventListener('input', () => {
    if (picked && input.value !== picked) { picked = null; mark(false); onClear?.(); }
    clearTimeout(timer); timer = setTimeout(search, 280);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; draw(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') open(false);
  });
  list.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); choose(Number(li.dataset.i)); } });
  input.addEventListener('blur', () => setTimeout(() => open(false), 150));
  input.addEventListener('focus', () => { if (items.length && !picked) draw(); });
  return { verified: () => !!picked };
}

// Convenience for forms: keeps hidden city/state/lat/lng inputs in sync with the visible search box.
export function placeFields(form, input, { city = 'city', state = 'state', lat = 'lat', lng = 'lng' } = {}) {
  const hidden = (n) => form.querySelector(`input[type=hidden][name="${n}"]`) || form.appendChild(Object.assign(document.createElement('input'), { type: 'hidden', name: n }));
  const set = (p) => { hidden(city).value = p?.city || input.value.split(',')[0].trim(); hidden(state).value = p?.state || ''; hidden(lat).value = p?.lat ?? ''; hidden(lng).value = p?.lng ?? ''; };
  attachPlace(input, { onPick: set, onClear: () => set(null) });
  input.addEventListener('input', () => { if (!input.dataset.placeVerified) set(null); });
  set(null);
}
