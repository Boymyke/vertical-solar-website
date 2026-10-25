// Generic list + create/edit modal for simple CMS-style resources.
import { $, $$, api, esc, toast, fail, table, modal, formHtml, readForm, validate, confirmBox, bindWidgets, debounce } from './lib.js';

export function editForm({ resource, title, fields, item, onSaved, size = 'wide', prepare }) {
  const { el, close } = modal({ title: item?.id ? `Edit ${title}` : `New ${title}`, size,
    body: `<form data-f>${formHtml(fields, item || {})}</form>`,
    footer: `${item?.id ? '<button class="btn btn-danger" data-del style="margin-right:auto"><i class="ri-delete-bin-line"></i> Delete</button>' : ''}<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save><i class="ri-save-line"></i> Save</button>` });
  const form = $('[data-f]', el);
  bindWidgets(form);
  $('[data-cancel]', el).onclick = close;
  $('[data-save]', el).onclick = async (e) => {
    if (!validate(form)) return;
    let body;
    try { body = readForm(form, fields); } catch (err) { return fail(err); }
    if (prepare) body = prepare(body, item) || body;
    e.currentTarget.classList.add('loading');
    try {
      const r = item?.id ? await api(`/api/admin/${resource}/${item.id}`, { method: 'PUT', body }) : await api(`/api/admin/${resource}`, { body });
      toast('Saved'); close(); onSaved?.(r.item);
    } catch (err) { fail(err); e.currentTarget.classList.remove('loading'); }
  };
  $('[data-del]', el)?.addEventListener('click', async () => {
    if (!(await confirmBox(`Delete this ${title}? This cannot be undone.`, { danger: true, ok: 'Delete' }))) return;
    try { await api(`/api/admin/${resource}/${item.id}`, { method: 'DELETE' }); toast('Deleted'); close(); onSaved?.(null); } catch (err) { fail(err); }
  });
  return el;
}

// Renders a searchable table bound to /api/admin/{resource} into `mount`.
export function resourceList({ mount, resource, title, columns, fields, query = {}, searchable = true, newLabel, emptyText, toolbar = '', prepare, onRowClick, filters = '' }) {
  mount.innerHTML = `<div class="card"><div class="toolbar">${searchable ? '<div class="search"><i class="ri-search-line"></i><input class="input" data-q placeholder="Search"></div>' : ''}${filters}${toolbar}
    ${fields ? `<button class="btn btn-primary" data-new style="margin-left:auto"><i class="ri-add-line"></i> ${esc(newLabel || 'Add ' + title)}</button>` : ''}</div><div data-body><div class="loading-row"><span class="spinner"></span>Loading…</div></div></div>`;
  const state = { q: '', ...query };
  async function load() {
    const p = new URLSearchParams({ per: 200 });
    for (const [k, v] of Object.entries(state)) if (v !== '' && v != null) p.set(k, v);
    try {
      const r = await api(`/api/admin/${resource}?` + p);
      $('[data-body]', mount).innerHTML = table({ rows: r.items, columns, onRow: true, empty: state.q ? `Nothing matches "${state.q}"\nTry a different word.` : emptyText || `No ${title}s yet\nUse "${newLabel || 'Add ' + title}" to create the first one.`, emptyIcon: state.q ? 'ri-search-eye-line' : 'ri-inbox-2-line' });
      $$('tr[data-row]', mount).forEach((tr) => (tr.onclick = (e) => {
        if (e.target.closest('a,button')) return;
        const item = r.items[tr.dataset.row];
        if (onRowClick) return onRowClick(item, load);
        if (fields) api(`/api/admin/${resource}/${item.id}`).then((full) => editForm({ resource, title, fields, item: full, onSaved: load, prepare }));
      }));
    } catch (err) { $('[data-body]', mount).innerHTML = `<div class="empty"><i class="ri-wifi-off-line"></i><strong>Couldn't load this list</strong><span>${esc(err.message)}</span></div>`; }
  }
  $('[data-q]', mount)?.addEventListener('input', debounce((e) => { state.q = e.target.value; load(); }));
  $('[data-new]', mount)?.addEventListener('click', () => editForm({ resource, title, fields, item: null, onSaved: load, prepare }));
  $$('[data-filter]', mount).forEach((el) => (el.onchange = () => { state[el.dataset.filter] = el.value; load(); }));
  load();
  return { reload: load, state };
}
