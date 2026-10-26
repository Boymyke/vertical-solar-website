import { $, $$, api, esc, date, datetime, toast, fail, table, statusPill, confirmBox, uploadFiles, pickFiles, bindWidgets, fieldHtml, toLocalInput, fromLocalInput, debounce, modal } from '../lib.js';

const CATS = [['guides', 'Guides'], ['solar-care', 'Solar care'], ['finance', 'Savings & finance'], ['case-studies', 'Case studies'], ['news', 'News']];

export default async function (ctx) {
  const { root, params, setTitle } = ctx;
  if (params[0]) return editor(ctx, params[0] === 'new' ? null : params[0]);
  setTitle('Blog', 'Publish articles with images — each one gets its own SEO-optimised page', '<a class="btn btn-primary" href="#/blog/new"><i class="ri-quill-pen-line"></i> New article</a>');
  root.innerHTML = `<div class="card"><div class="toolbar"><div class="search"><i class="ri-search-line"></i><input class="input" data-q placeholder="Search articles"></div><select class="input" data-st style="width:auto"><option value="">All</option><option value="published">Published</option><option value="draft">Drafts</option></select></div><div data-body></div></div>`;
  const st = { q: '', status: '' };
  async function load() {
    const p = new URLSearchParams({ per: 200 }); if (st.q) p.set('q', st.q); if (st.status) p.set('status', st.status);
    const r = await api('/api/admin/posts?' + p);
    $('[data-body]', root).innerHTML = table({ rows: r.items, onRow: true, empty: 'No articles yet.', columns: [
      { label: 'Article', render: (b) => `<div class="person">${b.cover ? `<img class="thumb" style="width:64px" src="${esc(b.cover)}" alt="">` : ''}<div><strong>${esc(b.title)}</strong><span>/blog/${esc(b.slug)}</span></div></div>` },
      { label: 'Category', render: (b) => `<span class="pill">${esc((b.category || '').replace('-', ' '))}</span>` }, { label: 'Status', render: (b) => statusPill(b.status) },
      { label: 'Published', render: (b) => date(b.published_at) }, { label: 'Views', align: 'right', key: 'views' },
      { label: '', render: (b) => (b.status === 'published' ? `<a class="btn btn-sm" href="/blog/${esc(b.slug)}" target="_blank" rel="noopener"><i class="ri-external-link-line"></i></a>` : '') }] });
    $$('tr[data-row]', root).forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest('a')) location.hash = `#/blog/${r.items[tr.dataset.row].id}`; }));
  }
  $('[data-q]', root).oninput = debounce((e) => { st.q = e.target.value; load(); });
  $('[data-st]', root).onchange = (e) => { st.status = e.target.value; load(); };
  load();
}

async function editor(ctx, id) {
  const { root, setTitle, user } = ctx;
  const p = id ? await api(`/api/admin/posts/${id}`) : { title: '', body: '', status: 'draft', category: 'guides', author_name: user.name };
  setTitle(id ? 'Edit article' : 'New article', id ? `/blog/${p.slug}` : 'Write, add images, and publish', `<a class="btn" href="#/blog"><i class="ri-arrow-left-line"></i> All articles</a>${id ? '<button class="btn btn-danger" data-del><i class="ri-delete-bin-line"></i></button>' : ''}`);
  root.innerHTML = `
  <div class="grid g-21">
    <div class="stack">
      <input class="input" data-title value="${esc(p.title)}" placeholder="Article title" style="font-size:22px;font-weight:650;min-height:54px;font-family:var(--display)">
      <div><div class="rte-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" data-cmd="formatBlock" data-arg="H2" title="Heading"><i class="ri-h-2"></i></button><button type="button" data-cmd="formatBlock" data-arg="H3" title="Sub-heading"><i class="ri-h-3"></i></button><button type="button" data-cmd="formatBlock" data-arg="P" title="Paragraph"><i class="ri-paragraph"></i></button>
        <button type="button" data-cmd="bold" title="Bold"><i class="ri-bold"></i></button><button type="button" data-cmd="italic" title="Italic"><i class="ri-italic"></i></button>
        <button type="button" data-cmd="insertUnorderedList" title="Bullet list"><i class="ri-list-unordered"></i></button><button type="button" data-cmd="insertOrderedList" title="Numbered list"><i class="ri-list-ordered"></i></button>
        <button type="button" data-cmd="formatBlock" data-arg="BLOCKQUOTE" title="Quote"><i class="ri-double-quotes-l"></i></button><button type="button" data-link title="Link"><i class="ri-link"></i></button>
        <button type="button" data-img title="Insert image"><i class="ri-image-add-line"></i></button><button type="button" data-video title="Embed YouTube video"><i class="ri-youtube-line"></i></button><button type="button" data-callout title="Highlight box"><i class="ri-lightbulb-line"></i></button>
        <button type="button" data-cmd="removeFormat" title="Clear formatting"><i class="ri-format-clear"></i></button><button type="button" data-html title="Edit HTML" style="margin-left:auto"><i class="ri-code-s-slash-line"></i></button></div>
        <div class="rte prose" contenteditable="true" data-body aria-label="Article body">${p.body || '<p>Start writing…</p>'}</div>
        <textarea class="input" data-src hidden rows="20" style="font-family:ui-monospace,monospace;font-size:12px;border-radius:0 0 10px 10px"></textarea></div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-h"><h2>Publish</h2></div><div class="card-b stack">
        <div class="field"><label>Status</label><select class="input" data-status><option value="draft" ${p.status === 'draft' ? 'selected' : ''}>Draft</option><option value="published" ${p.status === 'published' ? 'selected' : ''}>Published</option></select></div>
        <div class="field"><label>Publish date</label><input class="input" type="datetime-local" data-pub value="${esc(toLocalInput(p.published_at))}"><span class="hint">Set a future date to schedule.</span></div>
        <div class="row"><button class="btn btn-primary grow" data-save><i class="ri-save-line"></i> Save</button>${p.status === 'published' && p.slug ? `<a class="btn" href="/blog/${esc(p.slug)}" target="_blank" rel="noopener"><i class="ri-external-link-line"></i> View</a>` : ''}</div></div></div>
      <div class="card"><div class="card-h"><h2>Details</h2></div><div class="card-b stack" data-meta>
        ${fieldHtml({ name: 'cover', label: 'Cover image (1200×630 ideal)', type: 'image', folder: 'blog' }, p.cover)}
        <div class="field"><label>Category</label><select class="input" data-cat>${CATS.map(([v, l]) => `<option value="${v}" ${v === p.category ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Excerpt</label><textarea class="input" data-excerpt rows="3" placeholder="One or two sentences shown on the blog list">${esc(p.excerpt || '')}</textarea></div>
        <div class="field"><label>Author</label><input class="input" data-author value="${esc(p.author_name || '')}"></div>
        <div class="field"><label>Web address</label><input class="input" data-slug value="${esc(p.slug || '')}" placeholder="auto from title"></div></div></div>
      <div class="card"><div class="card-h"><h2>SEO</h2></div><div class="card-b stack">
        <div class="field"><label>SEO title <span class="muted small" data-c1></span></label><input class="input" data-seot value="${esc(p.seo_title || '')}" placeholder="Defaults to the article title"></div>
        <div class="field"><label>Meta description <span class="muted small" data-c2></span></label><textarea class="input" data-seod rows="3" placeholder="~150 characters that make people click">${esc(p.seo_description || '')}</textarea></div>
        <div style="border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--surface-2)"><div class="small muted">Google preview</div><div style="color:#1a0dab;font-size:16px" data-gt></div><div style="color:#006621;font-size:12px" data-gu></div><div class="small" data-gd></div></div></div></div>
    </div>
  </div>`;
  const body = $('[data-body]', root), src = $('[data-src]', root);
  bindWidgets($('[data-meta]', root));
  const exec = (cmd, arg) => { body.focus(); document.execCommand(cmd, false, arg); };
  $('.rte-toolbar', root).addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cmd) exec(b.dataset.cmd, b.dataset.arg);
    if (b.dataset.link != null) { const u = prompt('Link URL (e.g. /packages or https://…)'); if (u) exec('createLink', u); }
    if (b.dataset.img != null) { const f = await pickFiles('image/*', true); if (!f.length) return; toast('Uploading…'); try { const r = await uploadFiles(f, 'blog'); r.files.forEach((x) => exec('insertHTML', `<figure><img src="${x.url}" alt="${esc(prompt('Describe this image (alt text for accessibility & SEO)', '') || '')}"></figure><p></p>`)); } catch (err) { fail(err); } }
    if (b.dataset.video != null) { const u = prompt('YouTube link'); const m = u && u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/); if (m) exec('insertHTML', `<iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="Video" allowfullscreen loading="lazy"></iframe><p></p>`); }
    if (b.dataset.callout != null) exec('insertHTML', '<div class="callout"><strong>Tip:</strong> write your highlight here.</div><p></p>');
    if (b.dataset.html != null) { if (src.hidden) { src.value = body.innerHTML; src.hidden = false; body.hidden = true; } else { body.innerHTML = src.value; src.hidden = true; body.hidden = false; } }
  });
  const seo = () => {
    const t = $('[data-seot]', root).value || $('[data-title]', root).value; const d = $('[data-seod]', root).value || $('[data-excerpt]', root).value;
    $('[data-c1]', root).textContent = `${t.length}/60`; $('[data-c2]', root).textContent = `${d.length}/160`;
    $('[data-gt]', root).textContent = `${t} | Vertical Solar Blog`.slice(0, 70); $('[data-gu]', root).textContent = `verticalsolar.com.ng › blog › ${$('[data-slug]', root).value || '…'}`; $('[data-gd]', root).textContent = d.slice(0, 160);
  };
  $$('[data-seot],[data-seod],[data-title],[data-excerpt],[data-slug]', root).forEach((x) => x.addEventListener('input', seo)); seo();
  $('[data-save]', root).onclick = async (e) => {
    if (!src.hidden) body.innerHTML = src.value;
    const data = { title: $('[data-title]', root).value.trim(), body: body.innerHTML, status: $('[data-status]', root).value, published_at: fromLocalInput($('[data-pub]', root).value),
      cover: $('[name=cover]', root).value, category: $('[data-cat]', root).value, excerpt: $('[data-excerpt]', root).value, author_name: $('[data-author]', root).value,
      slug: $('[data-slug]', root).value || undefined, seo_title: $('[data-seot]', root).value, seo_description: $('[data-seod]', root).value };
    if (!data.title) return fail('Add a title');
    const busyBtn = e.currentTarget; busyBtn.classList.add('loading');
    try { const r = id ? await api(`/api/admin/posts/${id}`, { method: 'PUT', body: data }) : await api('/api/admin/posts', { body: data }); toast(data.status === 'published' ? 'Published' : 'Draft saved'); location.hash = `#/blog/${r.item.id}`; if (id) editor(ctx, id); }
    catch (err) { fail(err); busyBtn.classList.remove('loading'); }
  };
  $('[data-del]')?.addEventListener('click', async () => { if (await confirmBox('Delete this article?', { danger: true, ok: 'Delete' })) { await api(`/api/admin/posts/${id}`, { method: 'DELETE' }); location.hash = '#/blog'; } });
}
