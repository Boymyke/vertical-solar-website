// Shared helpers for the CRM app: API client, formatting, modals, forms, tables, uploads.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const naira = (n) => '₦' + Math.round(Number(n || 0)).toLocaleString('en-NG');
export const num = (n) => Number(n || 0).toLocaleString('en-NG');
export const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
const asDate = (d) => (d ? new Date(String(d).includes('T') ? d : String(d).replace(' ', 'T') + 'Z') : null);
export const date = (d) => (d ? asDate(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const datetime = (d) => (d ? asDate(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const time = (d) => (d ? asDate(d).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '—');
export function ago(d) {
  if (!d) return '—';
  const s = (Date.now() - asDate(d).getTime()) / 1000;
  if (s < 0) { const f = -s; if (f < 3600) return `in ${Math.round(f / 60)} min`; if (f < 86400) return `in ${Math.round(f / 3600)} h`; return `in ${Math.round(f / 86400)} d`; }
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)} d ago`; return date(d);
}
export const toLocalInput = (d) => { if (!d) return ''; const x = asDate(d); const off = x.getTimezoneOffset(); return new Date(x - off * 60000).toISOString().slice(0, 16); };
export const fromLocalInput = (v) => (v ? new Date(v).toISOString().replace('T', ' ').slice(0, 19) : null);
export const phoneLink = (p) => (p ? `<a href="tel:${esc(p)}">${esc(p)}</a>` : '—');
export const waLink = (p, text = '') => (p ? `https://wa.me/${String(p).replace(/\D/g, '').replace(/^0/, '234')}${text ? '?text=' + encodeURIComponent(text) : ''}` : '#');

export class ApiError extends Error { constructor(msg, status, data) { super(msg); this.status = status; this.data = data; } }
export async function api(path, { method, body, raw } = {}) {
  const init = { method: method || (body !== undefined ? 'POST' : 'GET'), headers: { accept: 'application/json', 'x-requested-with': 'fetch' }, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  const res = await fetch(path, init);
  if (raw) return res;
  let data = null;
  try { data = await res.json(); } catch {}
  if (res.status === 401 && !path.startsWith('/api/auth/')) { location.hash = '#/login'; }
  if (res.status === 428) { location.hash = '#/change-password'; }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  // Anything saved or deleted may change the menu counts (follow-ups, issues…): tell the app to refresh them.
  if (init.method !== 'GET' && path.startsWith('/api/admin/')) window.dispatchEvent(new CustomEvent('vs:changed', { detail: path }));
  return data;
}

// ── Toasts ──
export function toast(msg, type = 'ok') {
  let wrap = $('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; wrap.setAttribute('role', 'status'); document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = `toast ${type === 'err' ? 'err' : ''}`;
  t.innerHTML = `<i class="${type === 'err' ? 'ri-error-warning-line' : 'ri-checkbox-circle-line'}"></i><span>${esc(msg)}</span>`;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 3200);
}
export const fail = (e) => toast(e?.message || String(e), 'err');

// ── Modals ──
export function modal({ title, body = '', footer = '', size = '', onOpen } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" data-x style="margin-left:auto" aria-label="Close"><i class="ri-close-line"></i></button></div>
    <div class="modal-b">${body}</div>${footer ? `<div class="modal-f">${footer}</div>` : ''}</div>`;
  document.body.appendChild(ov);
  const prev = document.activeElement;
  const close = () => { ov.remove(); document.removeEventListener('keydown', key); prev?.focus?.(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  $('[data-x]', ov).addEventListener('click', close);
  const m = $('.modal', ov);
  setTimeout(() => (m.querySelector('input:not([type=hidden]),select,textarea') || m.querySelector('button'))?.focus(), 30);
  onOpen?.(m, close);
  return { el: m, close };
}

export function confirmBox(message, { title = 'Are you sure?', ok = 'Confirm', danger = false, html = false } = {}) {
  return new Promise((resolve) => {
    const { el, close } = modal({ title, size: 'narrow', body: html ? message : `<p style="margin:0">${esc(message)}</p>`,
      footer: `<button class="btn" data-no>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(ok)}</button>` });
    $('[data-no]', el).onclick = () => { close(); resolve(false); };
    $('[data-yes]', el).onclick = () => { close(); resolve(true); };
  });
}

// ── Form builder ──
// field: { name, label, type: text|email|tel|number|textarea|select|date|datetime|checkbox|switch|image|images|html|icon|json|hidden|customer|user|product, options, hint, full, required, placeholder, step }
export function fieldHtml(f, value) {
  const id = `f-${f.name}-${Math.random().toString(36).slice(2, 7)}`;
  const req = f.required ? 'required' : '';
  const v = value ?? f.default ?? '';
  const wrap = (inner) => `<div class="field ${f.full ? 'full' : ''}" data-field="${f.name}">${f.label && !['checkbox', 'switch'].includes(f.type) ? `<label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>` : ''}${inner}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
  switch (f.type) {
    case 'hidden': return `<input type="hidden" name="${f.name}" value="${esc(v)}">`;
    case 'textarea': return wrap(`<textarea class="input" id="${id}" name="${f.name}" ${req} rows="${f.rows || 4}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`);
    case 'select': return wrap(`<select class="input" id="${id}" name="${f.name}" ${req}>${(f.options || []).map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`);
    case 'checkbox': return `<div class="field ${f.full ? 'full' : ''}"><label class="check"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}><span>${esc(f.label)}${f.hint ? `<br><span class="hint">${esc(f.hint)}</span>` : ''}</span></label></div>`;
    case 'switch': return `<div class="field ${f.full ? 'full' : ''}"><label class="switch"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}><span class="track"></span><span>${esc(f.label)}</span></label>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
    case 'date': return wrap(`<input class="input" type="date" id="${id}" name="${f.name}" value="${esc(String(v).slice(0, 10))}" ${req}>`);
    case 'datetime': return wrap(`<input class="input" type="datetime-local" id="${id}" name="${f.name}" value="${esc(toLocalInput(v))}" ${req}>`);
    case 'file': return wrap(`<div class="img-pick file-pick"><div class="stack" style="gap:6px;flex:1"><input class="input" id="${id}" name="${f.name}" value="${esc(v)}" placeholder="Upload a PDF, or paste an https:// link" ${req}><div class="row"><button type="button" class="btn btn-sm" data-upload="${f.name}" data-folder="${f.folder || 'files'}"><i class="ri-upload-2-line"></i> Upload PDF</button>${v ? `<a class="btn btn-sm btn-ghost" href="${esc(v)}" target="_blank" rel="noopener"><i class="ri-external-link-line"></i> Open current file</a>` : ''}</div></div></div>`);
    case 'image': return wrap(`<div class="img-pick"><div class="preview" data-preview style="${v ? `background-image:url('${esc(v)}')` : ''}">${v ? '' : '<i class="ri-image-line"></i>'}</div><div class="stack" style="gap:6px"><input class="input" id="${id}" name="${f.name}" value="${esc(v)}" placeholder="https:// or upload"><div class="row"><button type="button" class="btn btn-sm" data-upload="${f.name}" data-folder="${f.folder || 'website'}"><i class="ri-upload-2-line"></i> Upload</button>${v ? `<button type="button" class="btn btn-sm btn-ghost" data-clear="${f.name}">Remove</button>` : ''}</div></div></div>`);
    case 'images': {
      const arr = Array.isArray(v) ? v : [];
      return wrap(`<div class="stack" style="gap:8px"><input type="hidden" name="${f.name}" value="${esc(JSON.stringify(arr))}" data-json><div class="photo-grid" data-imgs="${f.name}">${arr.map((u, i) => `<div style="position:relative"><img src="${esc(u)}" alt=""><button type="button" class="icon-btn" style="position:absolute;top:2px;right:2px;background:#fff;width:26px;height:26px;font-size:14px" data-rmimg="${i}" aria-label="Remove image"><i class="ri-close-line"></i></button></div>`).join('')}</div>
        <div class="row"><button type="button" class="btn btn-sm" data-upload-many="${f.name}" data-folder="${f.folder || 'website'}"><i class="ri-upload-2-line"></i> Add photos</button><button type="button" class="btn btn-sm btn-ghost" data-addurl="${f.name}">Add by URL</button></div></div>`);
    }
    case 'icon': return wrap(`<div class="row"><span class="card-icon" data-icon-preview style="font-size:20px"><i class="${esc(v || 'ri-question-line')}"></i></span><input class="input grow" id="${id}" name="${f.name}" value="${esc(v)}" readonly ${req} style="max-width:220px"><button type="button" class="btn btn-sm" data-pick-icon="${f.name}"><i class="ri-apps-line"></i> Choose icon</button></div>`);
    case 'section': return `<div class="form-section"><h3>${esc(f.label)}</h3>${f.hint ? `<p>${esc(f.hint)}</p>` : ''}</div>`;
    case 'place': {
      const lat = f.values?.[f.latName || 'lat'], lng = f.values?.[f.lngName || 'lng'];
      return wrap(`<div class="place-field"><input class="input" id="${id}" name="${f.name}" value="${esc(v)}" ${req} placeholder="${esc(f.placeholder || 'Start typing an area or street, then pick from the list')}" data-place-input data-lat="${f.latName || 'lat'}" data-lng="${f.lngName || 'lng'}" ${lat != null && lat !== '' ? 'data-place-verified="1"' : ''}></div>
        <input type="hidden" name="${f.latName || 'lat'}" value="${esc(lat ?? '')}"><input type="hidden" name="${f.lngName || 'lng'}" value="${esc(lng ?? '')}">
        ${f.map ? `<div class="place-map" data-place-map ${lat != null && lat !== '' ? '' : 'hidden'}></div><span class="hint" data-place-maphint ${lat != null && lat !== '' ? '' : 'hidden'}>Drag the pin to the exact spot if needed.</span>` : ''}`);
    }
    case 'richtext': return wrap(`<div data-rte-wrap><div class="rte-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" data-cmd="bold" title="Bold"><i class="ri-bold"></i></button><button type="button" data-cmd="italic" title="Italic"><i class="ri-italic"></i></button>
        <span class="sep"></span><button type="button" data-cmd="insertUnorderedList" title="Bullet list"><i class="ri-list-unordered"></i></button><button type="button" data-cmd="insertOrderedList" title="Numbered list"><i class="ri-list-ordered"></i></button>
        ${f.headings ? '<button type="button" data-cmd="formatBlock" data-val="h2" title="Heading"><i class="ri-heading"></i></button><button type="button" data-cmd="formatBlock" data-val="p" title="Normal text"><i class="ri-paragraph"></i></button>' : ''}
        <span class="sep"></span><button type="button" data-cmd="createLink" title="Add a link"><i class="ri-link"></i></button><button type="button" data-cmd="removeFormat" title="Clear formatting"><i class="ri-format-clear"></i></button></div>
        <div class="rte ${f.tall ? 'tall' : ''}" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="${id}-l" data-rte="${f.name}" data-placeholder="${esc(f.placeholder || 'Write here…')}">${v || ''}</div></div>`).replace(`<label for="${id}">`, `<label id="${id}-l">`);
    case 'specs': {
      const obj = v && typeof v === 'object' ? v : (() => { try { return JSON.parse(v || '{}'); } catch { return {}; } })();
      const rows = Object.entries(obj).length ? Object.entries(obj) : [['', '']];
      return wrap(`<div class="kv-editor" data-specs="${f.name}">${rows.map(([k, val]) => specRow(k, val)).join('')}</div>
        <datalist id="spec-names">${SPEC_NAMES.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <div><button type="button" class="btn btn-sm" data-add-spec="${f.name}"><i class="ri-add-line"></i> Add a detail</button></div>`);
    }
    case 'link': {
      const known = SITE_LINKS.some(([u]) => u === v);
      return wrap(`<select class="input" id="${id}" data-link-select="${f.name}">
        <option value="">— No button —</option>
        ${LINK_GROUPS.map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(([u, l]) => `<option value="${esc(u)}" ${u === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}
        <option value="__custom" ${v && !known ? 'selected' : ''}>Another web address…</option></select>
        <input class="input" name="${f.name}" value="${esc(v)}" data-link-custom placeholder="https://… or /page" style="margin-top:6px" ${v && !known ? '' : 'hidden'}>`);
    }
    case 'pages': {
      const list = String(v || '*').split(',').map((x) => x.trim()).filter(Boolean);
      const all = !list.length || list.includes('*');
      return wrap(`<div class="stack" style="gap:8px" data-pages="${f.name}"><div class="choice-pills"><label><input type="radio" name="${f.name}__mode" value="all" ${all ? 'checked' : ''}><span>Every page</span></label><label><input type="radio" name="${f.name}__mode" value="some" ${all ? '' : 'checked'}><span>Only some pages</span></label></div>
        <div class="page-checks" ${all ? 'hidden' : ''}>${SITE_LINKS.filter(([u]) => u.startsWith('/') && !u.includes('#')).map(([u, l]) => `<label class="check"><input type="checkbox" value="${esc(u)}" ${list.includes(u) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}
        <label class="check"><input type="checkbox" value="/blog/*" ${list.includes('/blog/*') ? 'checked' : ''}><span>Every blog article</span></label><label class="check"><input type="checkbox" value="/shop/*" ${list.includes('/shop/*') ? 'checked' : ''}><span>Every shop product</span></label></div></div>`);
    }
    case 'json': return wrap(`<textarea class="input" id="${id}" name="${f.name}" rows="${f.rows || 4}" data-json-text style="font-family:ui-monospace,monospace;font-size:12px">${esc(typeof v === 'string' ? v : JSON.stringify(v || (f.empty ?? {}), null, 2))}</textarea>`);
    case 'list': return wrap(`<input class="input" id="${id}" name="${f.name}" value="${esc(Array.isArray(v) ? v.join(', ') : v)}" data-list placeholder="${esc(f.placeholder || 'Comma separated')}">`);
    default: return wrap(`<input class="input" type="${f.type || 'text'}" id="${id}" name="${f.name}" value="${esc(v)}" ${req} ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : f.type === 'number' && !f.negative ? 'min="0"' : ''}${f.max != null ? ` max="${f.max}"` : ''} placeholder="${esc(f.placeholder || '')}" ${f.readonly ? 'readonly' : ''}>`);
  }
}
export function formHtml(fields, values = {}) {
  return `<div class="form-grid">${fields.map((f) => fieldHtml(f.type === 'place' ? { ...f, values } : f, values[f.name])).join('')}</div>`;
}
const SPEC_NAMES = ['Capacity', 'Power', 'Voltage', 'Current', 'Battery type', 'Cycle life', 'Efficiency', 'Panel type', 'Phase', 'Warranty', 'Brand', 'Model', 'Dimensions', 'Weight', 'Display', 'Communication', 'Certifications'];
const specRow = (k = '', v = '') => `<div class="kv-row"><input class="input" placeholder="Detail, e.g. Capacity" value="${esc(k)}" list="spec-names" data-k aria-label="Detail name"><input class="input v" placeholder="Value, e.g. 5 kWh" value="${esc(v)}" data-v aria-label="Detail value"><button type="button" class="icon-btn" data-rm-spec aria-label="Remove this detail"><i class="ri-delete-bin-line"></i></button></div>`;
// Pages a popup button (or any link) can point to.
export const SITE_LINKS = [
  ['/', 'Home page'], ['/get-quote', 'Get a free quote'], ['/packages', 'Packages & prices'], ['/packages#calculator', 'Load calculator'], ['/financing', 'Pay monthly (financing)'],
  ['/shop', 'Shop'], ['/projects', 'Projects'], ['/solutions/residential', 'Home solar'], ['/solutions/commercial', 'Business solar'], ['/solutions/industrial', 'Industrial solar'],
  ['/about', 'About us'], ['/contact', 'Contact & branches'], ['/support', 'Report a fault'], ['/solar-care', 'Solar care guide'], ['/blog', 'Blog'], ['/testimonials', 'Customer reviews'], ['/faq', 'Questions (FAQ)'],
];
const LINK_GROUPS = [['Website pages', SITE_LINKS], ['Contact', [['#chat', 'Open the chat assistant'], ['tel:08186311330', 'Call the office'], ['https://wa.me/2348186311330', 'WhatsApp the office']]]];
export function readForm(root, fields) {
  const out = {};
  for (const f of fields) {
    const el = root.querySelector(`[name="${f.name}"]`);
    if (!el) continue;
    if (['checkbox', 'switch'].includes(f.type)) out[f.name] = el.checked ? 1 : 0;
    else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
    else if (f.type === 'datetime') out[f.name] = fromLocalInput(el.value);
    else if (f.type === 'images') out[f.name] = JSON.parse(el.value || '[]');
    else if (f.type === 'json') { try { out[f.name] = JSON.parse(el.value || (Array.isArray(f.empty) ? '[]' : '{}')); } catch { throw new Error(`${f.label}: invalid format`); } }
    else if (f.type === 'list') out[f.name] = el.value.split(',').map((s) => s.trim()).filter(Boolean);
    else out[f.name] = el.value;
  }
  for (const f of fields) {
    if (f.type === 'place') {
      const la = root.querySelector(`[name="${f.latName || 'lat'}"]`).value, ln = root.querySelector(`[name="${f.lngName || 'lng'}"]`).value;
      out[f.latName || 'lat'] = la === '' ? null : Number(la); out[f.lngName || 'lng'] = ln === '' ? null : Number(ln);
    }
    if (f.type === 'richtext') { const ed = root.querySelector(`[data-rte="${f.name}"]`); const h = ed.innerHTML.trim(); out[f.name] = ed.textContent.trim() || /<img/i.test(h) ? h : ''; }
    if (f.type === 'specs') {
      const o = {};
      root.querySelectorAll(`[data-specs="${f.name}"] .kv-row`).forEach((r) => { const k = r.querySelector('[data-k]').value.trim(), v = r.querySelector('[data-v]').value.trim(); if (k && v) o[k] = v; });
      out[f.name] = o;
    }
    if (f.type === 'pages') {
      const box = root.querySelector(`[data-pages="${f.name}"]`);
      const mode = box.querySelector(`[name="${f.name}__mode"]:checked`)?.value;
      const picked = [...box.querySelectorAll('.page-checks input:checked')].map((c) => c.value);
      out[f.name] = mode === 'some' && picked.length ? picked.join(',') : '*';
    }
  }
  return out;
}
// Marks every missing or invalid field in red with a short message under it, and moves to the first one.
const fieldMessage = (el) => (el.validity.valueMissing ? (el.tagName === 'SELECT' ? 'Choose an option' : 'This is required')
  : el.validity.typeMismatch ? (el.type === 'email' ? 'Enter a valid email address' : 'Check this value')
  : el.validity.tooShort ? `Use at least ${el.minLength} characters` : el.validity.rangeOverflow || el.validity.rangeUnderflow ? 'Check this value' : el.validationMessage || 'Check this field');
export function markField(el, msg) {
  const field = el.closest('.field') || el.parentElement;
  el.setAttribute('aria-invalid', 'true'); field?.classList.add('has-error');
  let m = field?.querySelector(':scope > .field-error');
  if (!m && field) { m = document.createElement('span'); m.className = 'field-error'; m.id = `err-${Math.random().toString(36).slice(2, 8)}`; field.appendChild(m); el.setAttribute('aria-describedby', m.id); }
  if (m) m.innerHTML = `<i class="ri-error-warning-fill" aria-hidden="true"></i> ${esc(msg)}`;
  const clear = () => { if (el.checkValidity()) { el.removeAttribute('aria-invalid'); field?.classList.remove('has-error'); m?.remove(); el.removeEventListener('input', clear); el.removeEventListener('change', clear); } };
  el.addEventListener('input', clear); el.addEventListener('change', clear);
}
export function validate(root) {
  const bad = [...root.querySelectorAll('input,select,textarea')].filter((el) => el.willValidate && !el.checkValidity());
  bad.forEach((el) => markField(el, fieldMessage(el)));
  if (bad.length) { bad[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); bad[0].focus({ preventScroll: true }); toast(bad.length === 1 ? 'One field needs your attention' : `${bad.length} fields need your attention`, 'err'); return false; }
  return true;
}

// Wire up upload / image / icon / location / editor widgets inside a container.
export function bindWidgets(root) {
  // Location search with a confirm-the-pin map.
  root.querySelectorAll('[data-place-input]').forEach(async (input) => {
    const { attachPlace } = await import('/assets/js/places.js');
    const wrap = input.closest('.field');
    const lat = root.querySelector(`[name="${input.dataset.lat}"]`), lng = root.querySelector(`[name="${input.dataset.lng}"]`);
    const mapEl = wrap.querySelector('[data-place-map]'), hint = wrap.querySelector('[data-place-maphint]');
    let map, marker;
    const show = async (la, ln) => {
      if (!mapEl) return;
      mapEl.hidden = false; if (hint) hint.hidden = false;
      const L = await leaflet();
      if (!map) {
        map = L.map(mapEl, { scrollWheelZoom: false }).setView([la, ln], 16);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
        marker = L.marker([la, ln], { draggable: true }).addTo(map);
        marker.on('dragend', () => { const p = marker.getLatLng(); lat.value = p.lat.toFixed(6); lng.value = p.lng.toFixed(6); });
      } else { marker.setLatLng([la, ln]); map.setView([la, ln], 16); }
      setTimeout(() => map.invalidateSize(), 60);
    };
    attachPlace(input, {
      onPick: (p) => { lat.value = p.lat; lng.value = p.lng; show(p.lat, p.lng); },
      onClear: () => { lat.value = ''; lng.value = ''; },
    });
    if (lat.value && lng.value) show(Number(lat.value), Number(lng.value));
  });
  // Simple rich-text editors.
  root.querySelectorAll('[data-rte-wrap]').forEach((w) => {
    const ed = w.querySelector('[data-rte]');
    w.querySelector('.rte-toolbar').addEventListener('mousedown', (e) => e.preventDefault());
    w.querySelector('.rte-toolbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cmd]'); if (!b) return;
      ed.focus();
      if (b.dataset.cmd === 'createLink') { const u = prompt('Link to (https://… or /page):'); if (u && /^(https?:\/\/|\/|mailto:|tel:)/.test(u)) document.execCommand('createLink', false, u); return; }
      document.execCommand(b.dataset.cmd, false, b.dataset.val ? `<${b.dataset.val}>` : null);
    });
    ed.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
  });
  // Key / value details.
  root.querySelectorAll('[data-add-spec]').forEach((b) => b.addEventListener('click', () => { const box = root.querySelector(`[data-specs="${b.dataset.addSpec}"]`); box.insertAdjacentHTML('beforeend', specRow()); box.lastElementChild.querySelector('input').focus(); }));
  root.addEventListener('click', (e) => { const rm = e.target.closest('[data-rm-spec]'); if (rm) { const box = rm.closest('[data-specs]'); rm.closest('.kv-row').remove(); if (!box.children.length) box.insertAdjacentHTML('beforeend', specRow()); } });
  // Link pickers.
  root.querySelectorAll('[data-link-select]').forEach((sel) => {
    const input = sel.parentElement.querySelector('[data-link-custom]');
    sel.addEventListener('change', () => { if (sel.value === '__custom') { input.hidden = false; input.value = ''; input.focus(); } else { input.hidden = true; input.value = sel.value; } input.dispatchEvent(new Event('input', { bubbles: true })); });
  });
  // Page pickers.
  root.querySelectorAll('[data-pages]').forEach((box) => box.addEventListener('change', (e) => { if (e.target.name?.endsWith('__mode')) box.querySelector('.page-checks').hidden = e.target.value !== 'some'; }));
  root.addEventListener('click', async (e) => {
    const up = e.target.closest('[data-upload]');
    if (up) {
      const files = await pickFiles('image/*,application/pdf', false);
      if (!files.length) return;
      up.classList.add('loading');
      try {
        const r = await uploadFiles(files, up.dataset.folder);
        const input = root.querySelector(`[name="${up.dataset.upload}"]`); input.value = r.url;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const pv = input.closest('.img-pick')?.querySelector('[data-preview]'); if (pv) { pv.style.backgroundImage = `url('${r.url}')`; pv.innerHTML = ''; }
        if (!pv) toast('File uploaded');
      } catch (err) { fail(err); } finally { up.classList.remove('loading'); }
    }
    const clr = e.target.closest('[data-clear]');
    if (clr) { const input = root.querySelector(`[name="${clr.dataset.clear}"]`); input.value = ''; const pv = input.closest('.img-pick').querySelector('[data-preview]'); pv.style.backgroundImage = ''; pv.innerHTML = '<i class="ri-image-line"></i>'; }
    const many = e.target.closest('[data-upload-many]');
    if (many) {
      const files = await pickFiles('image/*,video/mp4', true);
      if (!files.length) return;
      many.classList.add('loading');
      try { const r = await uploadFiles(files, many.dataset.folder); addImages(root, many.dataset.uploadMany, r.files.map((f) => f.url)); }
      catch (err) { fail(err); } finally { many.classList.remove('loading'); }
    }
    const addurl = e.target.closest('[data-addurl]');
    if (addurl) { const u = prompt('Image URL (https://…)'); if (u && /^(https?:\/\/|\/)/.test(u)) addImages(root, addurl.dataset.addurl, [u]); }
    const rm = e.target.closest('[data-rmimg]');
    if (rm) { const grid = rm.closest('[data-imgs]'); const name = grid.dataset.imgs; const input = root.querySelector(`[name="${name}"]`); const arr = JSON.parse(input.value || '[]'); arr.splice(Number(rm.dataset.rmimg), 1); input.value = JSON.stringify(arr); renderImgs(root, name); }
    const ic = e.target.closest('[data-pick-icon]');
    if (ic) { const v = await iconPicker(root.querySelector(`[name="${ic.dataset.pickIcon}"]`).value); if (v) { root.querySelector(`[name="${ic.dataset.pickIcon}"]`).value = v; const pv = ic.parentElement.querySelector('[data-icon-preview] i'); if (pv) pv.className = v; root.dispatchEvent(new CustomEvent('icon-picked', { detail: v })); } }
  });
}
function addImages(root, name, urls) { const input = root.querySelector(`[name="${name}"]`); const arr = JSON.parse(input.value || '[]'); input.value = JSON.stringify([...arr, ...urls]); renderImgs(root, name); }
function renderImgs(root, name) {
  const arr = JSON.parse(root.querySelector(`[name="${name}"]`).value || '[]');
  root.querySelector(`[data-imgs="${name}"]`).innerHTML = arr.map((u, i) => `<div style="position:relative"><img src="${esc(u)}" alt=""><button type="button" class="icon-btn" style="position:absolute;top:2px;right:2px;background:#fff;width:26px;height:26px;font-size:14px" data-rmimg="${i}" aria-label="Remove image"><i class="ri-close-line"></i></button></div>`).join('');
}
export function pickFiles(accept, multiple) {
  return new Promise((resolve) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple;
    i.onchange = () => resolve([...i.files]); i.click();
  });
}
export async function compressImage(file, max = 1920, quality = 0.82) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 350 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/webp', quality));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' }) : file;
  } catch { return file; }
}
export async function uploadFiles(files, folder = 'general') {
  const fd = new FormData();
  fd.append('folder', folder);
  for (const f of files) fd.append('file', await compressImage(f));
  return api('/api/admin/upload', { body: fd });
}

// ── Icon picker (Remix Icon pack) ──
export const SOCIAL_ICONS = [
  ['ri-facebook-circle-fill', 'Facebook'], ['ri-facebook-fill', 'Facebook (f)'], ['ri-instagram-line', 'Instagram'], ['ri-instagram-fill', 'Instagram fill'],
  ['ri-twitter-x-line', 'X / Twitter'], ['ri-linkedin-box-fill', 'LinkedIn'], ['ri-linkedin-fill', 'LinkedIn (in)'], ['ri-tiktok-fill', 'TikTok'], ['ri-tiktok-line', 'TikTok line'],
  ['ri-youtube-fill', 'YouTube'], ['ri-youtube-line', 'YouTube line'], ['ri-whatsapp-line', 'WhatsApp'], ['ri-whatsapp-fill', 'WhatsApp fill'], ['ri-telegram-fill', 'Telegram'],
  ['ri-threads-line', 'Threads'], ['ri-snapchat-fill', 'Snapchat'], ['ri-pinterest-fill', 'Pinterest'], ['ri-google-fill', 'Google'], ['ri-map-pin-2-fill', 'Google Maps'],
  ['ri-mail-line', 'Email'], ['ri-phone-line', 'Phone'], ['ri-global-line', 'Website'], ['ri-discord-fill', 'Discord'], ['ri-spotify-fill', 'Spotify'], ['ri-medium-fill', 'Medium'], ['ri-github-fill', 'GitHub'],
];
const GENERAL_ICONS = ['ri-sun-line', 'ri-moon-clear-line', 'ri-battery-2-charge-line', 'ri-flashlight-line', 'ri-plug-line', 'ri-home-5-line', 'ri-building-4-line', 'ri-store-2-line', 'ri-award-line', 'ri-shield-check-line', 'ri-medal-line', 'ri-tools-line', 'ri-customer-service-2-line', 'ri-leaf-line', 'ri-earth-line', 'ri-star-line', 'ri-gift-line', 'ri-percent-line', 'ri-money-dollar-circle-line', 'ri-hand-coin-line'];
export function iconPicker(current) {
  return new Promise((resolve) => {
    const all = [...SOCIAL_ICONS, ...GENERAL_ICONS.map((i) => [i, i.replace(/^ri-|-(line|fill)$/g, '').replace(/-/g, ' ')])];
    const { el, close } = modal({ title: 'Choose an icon', body: `<input class="input" placeholder="Search icons" data-q style="margin-bottom:12px"><div class="icon-grid">${all.map(([i, l]) => `<button type="button" data-i="${i}" class="${i === current ? 'on' : ''}"><i class="${i}"></i><span>${esc(l)}</span></button>`).join('')}</div>
      <p class="hint small muted" style="margin-top:10px">Icons from the Remix Icon pack. Any other Remix icon class (ri-…) can be typed below.</p><div class="row"><input class="input grow" data-custom placeholder="ri-…"><button class="btn btn-sm" data-use>Use</button></div>` });
    $('[data-q]', el).addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); $$('.icon-grid button', el).forEach((b) => (b.hidden = !b.textContent.toLowerCase().includes(q) && !b.dataset.i.includes(q))); });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]'); if (b) { close(); resolve(b.dataset.i); }
      if (e.target.closest('[data-use]')) { const v = $('[data-custom]', el).value.trim(); if (/^ri-[a-z0-9-]+$/.test(v)) { close(); resolve(v); } else toast('Icon names look like ri-something-line', 'err'); }
    });
  });
}

// ── Data table ──
export function table({ columns, rows, onRow, empty = 'Nothing here yet.', emptyIcon = 'ri-inbox-2-line', emptyAction = '' }) {
  if (!rows.length) return emptyState(emptyIcon, empty, emptyAction);
  return `<div class="table-wrap"><table class="t"><thead><tr>${columns.map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((r, i) => `<tr class="${onRow ? 'click' : ''}" data-row="${i}">${columns.map((c, j) => `<td data-label="${esc(c.label)}"${j === 0 ? ' class="lead"' : ''}${c.align ? ` style="text-align:${c.align}"` : ''}>${c.render ? c.render(r) : esc(r[c.key] ?? '—')}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}
// Friendly empty state: what is missing and what to do about it.
export function emptyState(icon, text, action = '') {
  const [title, ...rest] = String(text).split('\n');
  return `<div class="empty"><i class="${icon}"></i><strong>${esc(title)}</strong>${rest.length ? `<span>${esc(rest.join(' '))}</span>` : ''}${action}</div>`;
}
// Placeholder blocks shown while a screen loads.
export function skeleton(kind = 'page') {
  if (kind === 'list') return `<div class="card-b">${[90, 70, 80, 60].map((w) => `<div class="skel skel-line" style="width:${w}%"></div>`).join('')}</div>`;
  return `<div class="skel-wrap"><div class="grid g-4">${'<div class="skel skel-card"></div>'.repeat(4)}</div><div class="grid g-21"><div class="skel" style="height:300px;border-radius:20px"></div><div class="skel" style="height:300px;border-radius:20px"></div></div></div>`;
}

export const statusPill = (s) => {
  const map = { ok: ['won', 'customer', 'accepted', 'paid', 'delivered', 'completed', 'done', 'resolved', 'closed', 'published', 'active', 'sent'], warn: ['pending', 'viewed', 'scheduled', 'quoted', 'negotiation', 'processing', 'on_hold', 'draft', 'open', 'site_survey', 'in_progress'], bad: ['lost', 'declined', 'cancelled', 'expired', 'urgent', 'failed', 'inactive', 'revoked', 'auto_closed'], info: ['new', 'lead', 'contacted', 'human'] };
  const k = Object.keys(map).find((x) => map[x].includes(s)) || '';
  return `<span class="pill ${k}">${esc(String(s || '—').replace(/_/g, ' '))}</span>`;
};

export const STAGES = ['new', 'contacted', 'site_survey', 'quoted', 'negotiation', 'won', 'lost'];
export const SEGMENTS = [['residential', 'Residential'], ['commercial', 'Commercial'], ['industrial', 'Industrial'], ['government', 'Government']];

const scripts = {};
export function loadScript(src) {
  return (scripts[src] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete scripts[src]; rej(new Error('Could not load ' + src)); }; document.head.appendChild(s); }));
}
export function loadCss(href) { if (![...document.styleSheets].some((s) => s.href?.endsWith(href))) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); } }
export async function leaflet() { loadCss('/assets/vendor/leaflet/leaflet.css'); await loadScript('/assets/vendor/leaflet/leaflet.js'); window.L.Icon.Default.imagePath = '/assets/vendor/leaflet/images/'; return window.L; }
export async function chartjs() { await loadScript('/assets/vendor/chart.umd.min.js'); const C = window.Chart; C.defaults.font.family = "'Inter Tight', system-ui, sans-serif"; C.defaults.color = getComputedStyle(document.body).getPropertyValue('--muted').trim(); return C; }
export function baseMap(L, el, center = [8.5, 6.5], zoom = 6) {
  const m = L.map(el).setView(center, zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m);
  return m;
}
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export function copy(text) { navigator.clipboard?.writeText(text).then(() => toast('Copied')).catch(() => prompt('Copy this:', text)); }
