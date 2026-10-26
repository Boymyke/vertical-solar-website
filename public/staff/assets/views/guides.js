// Guides: the staff and administrator manuals, readable by everyone in the app.
// The administrator can replace a guide with a new PDF, edit its wording, add more or hide one.
import { $, $$, api, esc, toast, fail, modal, formHtml, readForm, validate, confirmBox, bindWidgets, date } from '../lib.js';

const FIELDS = [
  { name: 'title', label: 'Title', required: true, full: true },
  { name: 'description', label: 'What it covers', type: 'textarea', full: true },
  { name: 'file', label: 'Guide file (PDF)', type: 'file', required: true, full: true, folder: 'guides', hint: 'Uploading a new PDF replaces the guide for everyone straight away.' },
  { name: 'audience', label: 'Who can read it', type: 'select', options: [['all', 'Everyone with a login'], ['admin', 'Administrator only']] },
  { name: 'pages', label: 'Pages', type: 'number', min: 0 },
  { name: 'sort', label: 'Order', type: 'number' },
  { name: 'active', label: 'Show in the app', type: 'switch', default: 1 },
];

export default async function ({ root, setTitle }) {
  const r = await api('/api/admin/my-guides');
  setTitle('Guides', 'How to use the Vertical Solar app — read on any device or download', r.can_edit ? '<button class="btn btn-primary" data-new><i class="ri-add-line"></i> Add guide</button>' : '');
  const draw = (items) => {
    root.innerHTML = items.length ? `<div class="guides">${items.map((g) => `<article class="card guide ${g.active ? '' : 'is-off'}" data-id="${g.id}">
      <div class="guide-cover"><i class="ri-book-open-line" aria-hidden="true"></i><span>PDF${g.pages ? ` · ${g.pages} pages` : ''}</span></div>
      <div class="card-b stack" style="gap:8px"><div class="row between" style="align-items:flex-start"><h2 style="margin:0">${esc(g.title)}</h2>${g.audience === 'admin' ? '<span class="pill ink tx">Administrator only</span>' : '<span class="pill tx">Everyone</span>'}</div>
        ${g.description ? `<p class="muted" style="margin:0">${esc(g.description)}</p>` : ''}
        <span class="muted small">Updated ${esc(date(g.updated_at))}${g.active ? '' : ' · hidden from staff'}</span>
        <div class="row" style="flex-wrap:wrap;margin-top:6px"><button class="btn btn-primary" type="button" data-read="${g.id}"><i class="ri-eye-line"></i> Read</button><a class="btn" href="${esc(g.file)}" target="_blank" rel="noopener" download><i class="ri-download-2-line"></i> Download</a>${r.can_edit ? `<button class="btn btn-ghost" type="button" data-edit="${g.id}"><i class="ri-edit-line"></i> Edit or replace</button>` : ''}</div></div></article>`).join('')}</div>`
      : '<div class="card"><div class="empty"><i class="ri-book-open-line"></i><strong>No guides yet</strong><span>The administrator can add guides here.</span></div></div>';
  };
  draw(r.items);
  const reload = async () => { const x = await api('/api/admin/my-guides'); r.items = x.items; draw(x.items); };
  root.addEventListener('click', (e) => {
    const rd = e.target.closest('[data-read]');
    if (rd) {
      const g = r.items.find((x) => x.id === Number(rd.dataset.read));
      // Phones open the PDF in their own viewer; larger screens read it right here.
      if (matchMedia('(max-width: 760px)').matches) { window.open(g.file, '_blank', 'noopener'); return; }
      modal({ title: g.title, size: 'full', body: `<iframe class="guide-frame" src="${esc(g.file)}#view=FitH" title="${esc(g.title)}"></iframe>`, footer: `<a class="btn" href="${esc(g.file)}" target="_blank" rel="noopener"><i class="ri-external-link-line"></i> Open in a new tab</a>` });
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) edit(r.items.find((x) => x.id === Number(ed.dataset.edit)));
  });
  $('[data-new]')?.addEventListener('click', () => edit(null));

  function edit(g) {
    const { el, close } = modal({ title: g ? `Edit ${g.title}` : 'Add a guide', body: `<form class="form-grid" data-f novalidate>${formHtml(FIELDS, g || { audience: 'all', active: 1 })}</form>`,
      footer: `${g ? '<button class="btn btn-danger" data-del style="margin-right:auto"><i class="ri-delete-bin-line"></i> Delete</button>' : ''}<button class="btn" data-x2>Cancel</button><button class="btn btn-primary" data-ok><i class="ri-save-line"></i> Save</button>` });
    const f = $('[data-f]', el);
    bindWidgets(f);
    $('[data-x2]', el).onclick = close;
    $('[data-ok]', el).onclick = async (e) => {
      if (!validate(f)) return;
      const btn = e.currentTarget; btn.classList.add('loading');
      try {
        const body = readForm(f, FIELDS);
        if (g) await api(`/api/admin/guides/${g.id}`, { method: 'PUT', body }); else await api('/api/admin/guides', { body });
        toast(g ? 'Guide updated' : 'Guide added'); close(); reload();
      } catch (err) { fail(err); btn.classList.remove('loading'); }
    };
    $('[data-del]', el)?.addEventListener('click', async () => {
      if (!(await confirmBox(`Delete “${g.title}”? Staff will no longer see it. (To keep it but hide it, switch off “Show in the app” instead.)`, { danger: true, ok: 'Delete guide' }))) return;
      try { await api(`/api/admin/guides/${g.id}`, { method: 'DELETE' }); toast('Guide deleted'); close(); reload(); } catch (err) { fail(err); }
    });
  }
}
