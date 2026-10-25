// Blog listing: category filter, search, pagination.
import { $, $$, api, esc } from '../core.js';
import { postCard } from '../render.js';

export default async function () {
  const qs = new URLSearchParams(location.search);
  const state = { category: qs.get('category') || '', q: qs.get('q') || '', page: Number(qs.get('page') || 1) };
  const list = $('[data-blog-list]'), pag = $('[data-pagination]');
  async function load() {
    list.setAttribute('aria-busy', 'true');
    const p = new URLSearchParams({ per: 9, page: state.page });
    if (state.category) p.set('category', state.category);
    if (state.q) p.set('q', state.q);
    try {
      const r = await api('/api/public/posts?' + p);
      list.innerHTML = r.items.length ? r.items.map(postCard).join('') : `<div class="empty" style="grid-column:1/-1"><i class="ri-article-line" aria-hidden="true"></i>No articles found${state.q ? ` for “${esc(state.q)}”` : ''}.</div>`;
      pag.innerHTML = r.pages > 1 ? Array.from({ length: r.pages }, (_, i) => `<button class="btn ${i + 1 === r.page ? 'btn-primary' : 'btn-ghost'} btn-sm" type="button" data-page="${i + 1}" ${i + 1 === r.page ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('') : '';
    } catch { list.innerHTML = '<div class="empty" style="grid-column:1/-1">Could not load articles. Please refresh.</div>'; }
    list.removeAttribute('aria-busy');
    const u = new URLSearchParams(); if (state.category) u.set('category', state.category); if (state.q) u.set('q', state.q); if (state.page > 1) u.set('page', state.page);
    history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : ''));
  }
  $$('.filter-bar button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.cat === state.category);
    b.addEventListener('click', () => { $$('.filter-bar button').forEach((x) => x.setAttribute('aria-pressed', x === b)); state.category = b.dataset.cat; state.page = 1; load(); });
  });
  $('#blog-q').value = state.q;
  $('[data-blog-search]').addEventListener('submit', (e) => { e.preventDefault(); state.q = $('#blog-q').value.trim(); state.page = 1; load(); });
  pag.addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b) { state.page = Number(b.dataset.page); load(); scrollTo({ top: 0, behavior: 'smooth' }); } });
  load();
}
