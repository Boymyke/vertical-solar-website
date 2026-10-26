// Shopping cart (stored on this device until checkout).
import { $, $$, esc, naira, store, toast } from './core.js';

const KEY = 'vs-cart';
export const getCart = () => store.get(KEY, []);
const setCart = (c) => { store.set(KEY, c); render(); window.dispatchEvent(new CustomEvent('vs:cart')); };
export const cartTotal = () => getCart().reduce((s, i) => s + i.price * i.qty, 0);
export const clearCart = () => setCart([]);

export function addToCart(p, qty = 1) {
  const c = getCart();
  const ex = c.find((i) => i.id === p.id);
  if (ex) ex.qty = Math.min(500, ex.qty + qty);
  else c.push({ id: p.id, name: p.name, price: p.price, image: p.image || null, slug: p.slug, qty });
  setCart(c);
  toast(`${p.name} added to cart`);
  openCart(true);
}

let drawer, scrim;
function build() {
  scrim = document.createElement('div'); scrim.className = 'scrim';
  drawer = document.createElement('aside'); drawer.className = 'drawer'; drawer.setAttribute('aria-label', 'Shopping cart'); drawer.setAttribute('role', 'dialog');
  drawer.innerHTML = `<header><h2>Your cart</h2><button class="icon-btn" type="button" data-close aria-label="Close cart"><i class="ri-close-line" aria-hidden="true"></i></button></header>
    <div class="items"></div>
    <footer><div style="display:flex;justify-content:space-between;font-weight:600"><span>Subtotal</span><span data-subtotal></span></div>
    <p class="muted" style="font-size:.8rem;margin:0">Delivery and installation are confirmed after checkout.</p>
    <a class="btn btn-primary btn-block" href="/checkout"><i class="ri-secure-payment-line" aria-hidden="true"></i> Checkout</a></footer>`;
  document.body.append(scrim, drawer);
  scrim.addEventListener('click', () => openCart(false));
  drawer.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.close != null) openCart(false);
    const id = Number(b.dataset.id);
    const c = getCart(); const it = c.find((x) => x.id === id);
    if (b.dataset.inc && it) { it.qty += 1; setCart(c); }
    if (b.dataset.dec && it) { it.qty = Math.max(1, it.qty - 1); setCart(c); }
    if (b.dataset.rm) setCart(c.filter((x) => x.id !== id));
  });
  drawer.addEventListener('keydown', (e) => e.key === 'Escape' && openCart(false));
}

export function openCart(v = true) {
  if (!drawer) build();
  render();
  drawer.classList.toggle('open', v); scrim.classList.toggle('on', v);
  if (v) drawer.querySelector('[data-close]').focus();
}

function render() {
  const c = getCart();
  const n = c.reduce((s, i) => s + i.qty, 0);
  $$('[data-cart-count]').forEach((b) => { b.textContent = n; b.hidden = !n; });
  if (!drawer) return;
  $('.items', drawer).innerHTML = c.length ? c.map((i) => `
    <div class="cart-line">${i.image ? `<img src="${esc(i.image)}" alt="">` : '<span class="ph"><i class="ri-solar-panel-line" aria-hidden="true"></i></span>'}
      <div><strong>${esc(i.name)}</strong><span class="muted">${naira(i.price)}</span>
      <div class="qty" style="margin-top:6px"><button type="button" data-dec="1" data-id="${i.id}" aria-label="Decrease quantity">−</button><input value="${i.qty}" aria-label="Quantity" readonly><button type="button" data-inc="1" data-id="${i.id}" aria-label="Increase quantity">+</button></div></div>
      <button class="icon-btn" type="button" data-rm="1" data-id="${i.id}" aria-label="Remove ${esc(i.name)}"><i class="ri-delete-bin-line" aria-hidden="true"></i></button></div>`).join('')
    : '<div class="empty"><i class="ri-shopping-bag-3-line" aria-hidden="true"></i>Your cart is empty.<br><a href="/shop">Browse the shop</a></div>';
  $('[data-subtotal]', drawer).textContent = naira(cartTotal());
}

export function initCart(shopEnabled) {
  document.documentElement.dataset.shop = shopEnabled ? 'on' : 'off';
  try { localStorage.setItem('vs-shop', shopEnabled ? 'on' : 'off'); } catch {}
  $$('[data-shop-link]').forEach((el) => (el.hidden = !shopEnabled));
  render();
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-cart]')) { e.preventDefault(); openCart(true); }
    const add = e.target.closest('[data-add-to-cart]');
    if (add) {
      const holder = add.closest('[data-product]');
      if (!holder) return;
      const p = JSON.parse(holder.dataset.product);
      const qty = Math.max(1, Number($('#qty', holder)?.value || 1));
      addToCart(p, qty);
    }
    const q = e.target.closest('[data-qty]');
    if (q) { const inp = $('#qty'); if (inp) inp.value = Math.max(1, Number(inp.value || 1) + Number(q.dataset.qty)); }
  });
}
