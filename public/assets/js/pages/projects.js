// Projects listing with category filter.
import { $, $$, api } from '../core.js';
import { projectCard } from '../render.js';

export default async function () {
  const list = $('[data-project-list]');
  let all = [];
  try { all = await api('/api/public/projects'); } catch {}
  const show = (cat) => {
    const items = cat ? all.filter((p) => p.category === cat) : all;
    list.innerHTML = items.length ? items.map(projectCard).join('') : '<div class="empty" style="grid-column:1/-1"><i class="ri-building-line" aria-hidden="true"></i>No projects in this category yet.</div>';
  };
  const initial = new URLSearchParams(location.search).get('category') || '';
  $$('.filter-bar button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.cat === initial);
    b.addEventListener('click', () => { $$('.filter-bar button').forEach((x) => x.setAttribute('aria-pressed', x === b)); show(b.dataset.cat); });
  });
  show(initial);
}
