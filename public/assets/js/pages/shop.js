// Shop listing (can be switched off from the CRM).
import { $, $$, api, esc, naira } from '../core.js';

export default async function (site) {
  const list = $('[data-product-list]');
  const state = { cat: new URLSearchParams(location.search).get('category') || '', q: '' };
  async function load() {
    const p = new URLSearchParams(); if (state.cat) p.set('category', state.cat); if (state.q) p.set('q', state.q);
    try {
      const r = await api('/api/public/products?' + p);
      if (!r.enabled) { $('[data-shop]').hidden = true; $('[data-shop-closed]').hidden = false; return; }
      list.innerHTML = r.items.length ? r.items.map((x) => `
        <article class="product" data-product='${esc(JSON.stringify({ id: x.id, name: x.name, price: x.price, image: x.images[0] || null, slug: x.slug }))}'>
          <a class="img" href="/shop/${esc(x.slug)}" tabindex="-1" aria-hidden="true">${x.images[0] ? `<img src="${esc(x.images[0])}" alt="" loading="lazy">` : '<i class="ri-solar-panel-line"></i>'}</a>
          <div class="body">${x.brand ? `<span class="muted" style="font-size:.78rem">${esc(x.brand)}</span>` : ''}<h3><a href="/shop/${esc(x.slug)}">${esc(x.name)}</a></h3>
            <div><span class="price">${naira(x.price)}</span>${x.compare_price > x.price ? ` <s class="muted" style="font-size:.85rem">${naira(x.compare_price)}</s>` : ''}</div>
            <span class="stock ${x.in_stock ? 'in' : 'out'}" style="font-size:.8rem"><i class="${x.in_stock ? 'ri-checkbox-circle-fill' : 'ri-time-line'}" aria-hidden="true"></i> ${x.in_stock ? 'In stock' : 'Available on order'}</span>
            <button class="btn btn-primary btn-sm" type="button" data-add-to-cart><i class="ri-shopping-bag-3-line" aria-hidden="true"></i> Add to cart</button></div></article>`).join('')
        : '<div class="empty" style="grid-column:1/-1"><i class="ri-search-line" aria-hidden="true"></i>No products found. <a href="/get-quote">Ask us for it</a>.</div>';
    } catch { list.innerHTML = '<div class="empty" style="grid-column:1/-1">Could not load products.</div>'; }
  }
  $$('.shop-filters button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.cat === state.cat);
    b.addEventListener('click', () => { $$('.shop-filters button').forEach((x) => x.setAttribute('aria-pressed', x === b)); state.cat = b.dataset.cat; load(); });
  });
  $('[data-shop-search]').addEventListener('submit', (e) => { e.preventDefault(); state.q = $('#shop-q').value.trim(); load(); });
  load();
}
