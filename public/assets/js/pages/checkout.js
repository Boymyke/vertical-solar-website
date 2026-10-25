// Checkout: order request or Paystack payment.
import { $, api, esc, naira, toast } from '../core.js';
import { getCart, cartTotal, clearCart } from '../cart.js';

function summary(site) {
  const c = getCart();
  const box = $('[data-summary]');
  if (!c.length) { box.innerHTML = '<div class="empty"><i class="ri-shopping-bag-3-line" aria-hidden="true"></i>Your cart is empty. <a href="/shop">Go to the shop</a></div>'; $('[data-checkout-form] [type=submit]').disabled = true; return; }
  const del = Number(site?.shop?.delivery_fee || 0);
  box.innerHTML = `<div style="display:grid;gap:12px">${c.map((i) => `<div class="cart-line">${i.image ? `<img src="${esc(i.image)}" alt="">` : '<span class="ph"></span>'}<div><strong>${esc(i.name)}</strong><span class="muted">${i.qty} × ${naira(i.price)}</span></div><strong>${naira(i.qty * i.price)}</strong></div>`).join('')}</div>
    <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
    <div style="display:flex;justify-content:space-between"><span>Subtotal</span><strong>${naira(cartTotal())}</strong></div>
    <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Delivery</span><span>${del ? naira(del) : 'Confirmed after order'}</span></div>
    <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:1.25rem"><span>Total</span><strong>${naira(cartTotal() + del)}</strong></div>
    <p class="muted" style="font-size:.8rem;margin-top:12px">${esc(site?.shop?.delivery_note || '')}</p>`;
}

function loadPaystack() {
  return new Promise((res, rej) => { if (window.PaystackPop) return res(); const s = document.createElement('script'); s.src = 'https://js.paystack.co/v2/inline.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

export default function (site) {
  if (site && !site.shop.enabled) { location.href = '/shop'; return; }
  summary(site);
  const pk = site?.shop?.paystack_public_key;
  if (pk && site.shop.checkout_mode === 'paystack') $('[data-paystack-option]').hidden = false;
  const form = $('[data-checkout-form]');
  const status = $('.form-status', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bad = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
    if (bad) { bad.reportValidity(); return; }
    const body = Object.fromEntries(new FormData(form).entries());
    body.items = getCart().map((i) => ({ id: i.id, qty: i.qty }));
    const btn = form.querySelector('[type=submit]'); btn.classList.add('is-loading');
    try {
      const r = await api('/api/public/order', { body });
      if (body.payment_method === 'paystack' && pk) {
        if (!body.email) throw new Error('Please enter your email to pay online.');
        await loadPaystack();
        const popup = new window.PaystackPop();
        popup.newTransaction({ key: pk, email: body.email, amount: Math.round(r.total * 100), currency: 'NGN', reference: `${r.number}-${Date.now()}`,
          metadata: { order: r.number },
          onSuccess: async (tx) => { const v = await api('/api/public/order/verify', { body: { number: r.number, reference: tx.reference } }).catch(() => ({})); done(r, v.verified); },
          onCancel: () => done(r, false, true) });
      } else done(r, false);
    } catch (err) {
      status.hidden = false; status.className = 'form-status err'; status.innerHTML = `<i class="ri-error-warning-line" aria-hidden="true"></i><span>${esc(err.message)}</span>`;
    } finally { btn.classList.remove('is-loading'); }
  });
  function done(r, paid, cancelled) {
    clearCart();
    $('.split').innerHTML = `<div class="card form-success" style="grid-column:1/-1"><i class="ri-checkbox-circle-line" aria-hidden="true"></i><h2>Order ${esc(r.number)} received</h2>
      <p class="muted">${paid ? 'Payment confirmed. ' : cancelled ? 'Payment was not completed — no problem, our team will contact you to arrange payment. ' : ''}A member of our team will call you shortly to confirm delivery${paid ? '' : ' and payment'} details.</p>
      ${!paid && site?.shop?.bank_details ? `<div class="card" style="text-align:left;max-width:420px;margin:16px auto"><strong>Bank details</strong><p style="white-space:pre-line;margin:6px 0 0">${esc(site.shop.bank_details)}</p><p class="muted" style="font-size:.8rem;margin:8px 0 0">Use ${esc(r.number)} as the payment reference.</p></div>` : ''}
      <div class="btn-row" style="justify-content:center"><a class="btn btn-primary" href="/">Back to home</a><a class="btn btn-ghost" data-whatsapp="Hello, I just placed order ${esc(r.number)}." href="https://wa.me/${esc(site?.company?.whatsapp || '')}"><i class="ri-whatsapp-line" aria-hidden="true"></i> WhatsApp us</a></div></div>`;
    toast('Order placed');
    scrollTo({ top: 0, behavior: 'smooth' });
  }
}
