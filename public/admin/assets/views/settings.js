import { $, $$, api, esc, toast, fail, formHtml, readForm, bindWidgets, validate } from '../lib.js';

export default async function ({ root, name, user, can, setTitle }) {
  setTitle(name === 'profile' ? 'My profile' : 'Settings', name === 'profile' ? 'Your details and password' : 'Company details, shop & payments, integrations');
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const tabs = [['profile', 'My profile', true], ['company', 'Company', can('settings')], ['shop', 'Shop & payments', can('shop', 'settings')], ['integrations', 'Integrations', can('settings')]].filter((t) => t[2]);
  let active = name === 'profile' ? 'profile' : qs.get('tab') || (tabs[1] || tabs[0])[0];
  root.innerHTML = `<div class="tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${k === active ? 'on' : ''}">${l}</button>`).join('')}</div><div data-tab style="max-width:880px"></div>`;
  const tab = $('[data-tab]', root);
  const data = tabs.length > 1 ? await api('/api/admin/settings') : null;
  const group = (key, title, fields, sub = '', read) => {
    const v = data.settings[key];
    tab.innerHTML = `<div class="card"><div class="card-h"><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div><form class="card-b" data-f>${formHtml(fields, read?.in ? read.in(v) : v)}<div class="row" style="margin-top:14px"><button class="btn btn-primary"><i class="ri-save-line"></i> Save</button></div></form></div>`;
    const f = $('[data-f]', tab); bindWidgets(f);
    f.onsubmit = async (e) => { e.preventDefault(); if (!validate(f)) return; let out = readForm(f, fields); if (read?.out) out = read.out(out); try { await api(`/api/admin/settings/${key}`, { method: 'PUT', body: { value: { ...v, ...out } } }); toast('Saved'); } catch (err) { fail(err); } };
  };
  const views = {
    profile: () => {
      tab.innerHTML = `<div class="card"><div class="card-h"><h2>Your details</h2></div><form class="card-b" data-p><div class="form-grid"><div class="field"><label>Name</label><input class="input" name="name" value="${esc(user.name)}"></div><div class="field"><label>Phone</label><input class="input" name="phone" value="${esc(user.phone || '')}"></div>
        <div class="field full"><label>Email</label><input class="input" value="${esc(user.email)}" readonly><span class="hint">Ask an administrator to change your login email.</span></div></div><div class="row" style="margin-top:14px"><button class="btn btn-primary">Save</button></div></form></div>
        <div class="card" style="margin-top:16px"><div class="card-h"><h2>Change password</h2></div><form class="card-b stack" data-pw><div class="field"><label>Current password</label><input class="input" type="password" name="current" required autocomplete="current-password"></div>
        <div class="field"><label>New password</label><input class="input" type="password" name="password" required minlength="10" autocomplete="new-password"><span class="hint">At least 10 characters with upper and lower case letters and a number. Other devices will be signed out.</span></div><div><button class="btn btn-primary">Update password</button></div></form></div>`;
      $('[data-p]', tab).onsubmit = async (e) => { e.preventDefault(); const fd = new FormData(e.target); try { await api('/api/auth/profile', { method: 'PUT', body: { name: fd.get('name'), phone: fd.get('phone') } }); toast('Saved'); } catch (err) { fail(err); } };
      $('[data-pw]', tab).onsubmit = async (e) => { e.preventDefault(); const fd = new FormData(e.target); try { await api('/api/auth/password', { body: { current: fd.get('current'), password: fd.get('password') } }); toast('Password changed'); e.target.reset(); } catch (err) { fail(err); } };
    },
    company: () => group('company', 'Company details', [{ name: 'name', label: 'Brand name' }, { name: 'legal_name', label: 'Legal name' }, { name: 'tagline', label: 'Tagline', full: true }, { name: 'email', label: 'Public email', type: 'email' },
      { name: 'phones', label: 'Phone numbers', type: 'list', hint: 'Comma separated — the first is the main number' }, { name: 'whatsapp', label: 'WhatsApp number (international, digits only)', placeholder: '2348186311330' }, { name: 'founded', label: 'Founded (year)', type: 'number' },
      { name: 'address', label: 'Head office address', full: true }, { name: 'hours', label: 'Opening hours', full: true }, { name: 'rc_number', label: 'RC number (optional)' }], 'Used across the website, quotes, emails and the AI assistant.'),
    shop: () => group('shop', 'Shop & payments', [{ name: 'enabled', label: 'Online shop is on', type: 'switch', full: true },
      { name: 'checkout_mode', label: 'Checkout', type: 'select', options: [['request', 'Order request — we confirm by phone (no online payment)'], ['paystack', 'Allow online payment with Paystack']], full: true },
      { name: 'paystack_public_key', label: 'Paystack public key', placeholder: 'pk_live_…', hint: 'From your Paystack dashboard → Settings → API keys. The secret key must be added as a Cloudflare secret (PAYSTACK_SECRET_KEY) — never paste it here.', full: true },
      { name: 'delivery_fee', label: 'Flat delivery fee (₦, 0 = confirm later)', type: 'number' }, { name: 'delivery_note', label: 'Delivery note shown at checkout', type: 'textarea', full: true },
      { name: 'bank_details', label: 'Bank transfer details (shown after ordering and on quotes)', type: 'textarea', full: true, placeholder: 'Bank: …\nAccount name: Vertical Energy & Networks Ltd\nAccount number: …' }],
      data.secrets.paystack ? 'Paystack secret key detected ✓' : 'Paystack secret key not set — online payments cannot be verified until it is added in Cloudflare.'),
    integrations: () => {
      group('integrations', 'Integrations', [{ name: 'email_from_name', label: 'Email "from" name' }, { name: 'email_from', label: 'Email "from" address', type: 'email', placeholder: 'hello@verticalsolar.com.ng', hint: 'Must be on a domain verified in Resend.' },
        { name: 'notify_emails', label: 'Daily summary goes to', full: true, placeholder: 'owner@…, manager@…', hint: 'Morning email with new leads, due follow-ups, low stock and expiring warranties.' },
        { name: 'turnstile_site_key', label: 'Cloudflare Turnstile site key (spam protection, optional)', full: true }],
        `Email sending: ${data.secrets.resend ? '✓ Resend key set' : '✗ RESEND_API_KEY not set'} · Turnstile secret: ${data.secrets.turnstile ? '✓ set' : '✗ not set'}`);
    },
  };
  $$('[data-t]', root).forEach((b) => (b.onclick = () => { active = b.dataset.t; $$('[data-t]', root).forEach((x) => x.classList.toggle('on', x === b)); views[active](); }));
  views[active]();
}
