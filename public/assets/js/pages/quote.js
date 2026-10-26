// Public quote link: view, print, download as PDF, accept or decline.
import { $, api, esc, naira, fmtDate } from '../core.js';

const LOGO = document.querySelector('.site-header .logo')?.innerHTML || '';

export function quoteHtml(q, company, bank) {
  const sys = q.system || {};
  const sysRows = [['Inverter', sys.inverter_kva && `${sys.inverter_kva} kVA`], ['Solar array', sys.pv_kwp && `${sys.pv_kwp} kWp`], ['Battery storage', sys.battery_kwh && `${sys.battery_kwh} kWh ${sys.battery_type || ''}`], ['Est. daily energy', sys.daily_kwh && `${sys.daily_kwh} kWh`], ['Backup', sys.backup_hours && `${sys.backup_hours} hours`]].filter((r) => r[1]);
  return `<article class="quote-doc" id="quote-doc">
    <header class="q-head"><div><span class="logo">${LOGO}</span><p style="margin:10px 0 0;font-size:13px;color:#5b6b52">${esc(company.legal_name)}<br>${esc(company.address)}<br>${esc(company.phones.join(' · '))} · ${esc(company.email)}</p></div>
      <div style="text-align:right"><h1 style="font-size:28px;margin:0">Quotation</h1><p style="margin:4px 0 0;font-size:14px"><strong>${esc(q.number)}</strong></p><p style="margin:0;font-size:13px;color:#5b6b52">Issued ${fmtDate(q.sent_at || q.created_at)}${q.valid_until ? `<br>Valid until ${fmtDate(q.valid_until)}` : ''}</p></div></header>
    <div class="q-meta"><div><span>Prepared for</span><strong>${esc(q.customer_name || '')}</strong>${q.customer_company ? `<br>${esc(q.customer_company)}` : ''}${q.customer_address || q.customer_city ? `<br>${esc([q.customer_address, q.customer_city].filter(Boolean).join(', '))}` : ''}</div>
      <div><span>Contact</span>${esc(q.customer_phone || '')}${q.customer_email ? `<br>${esc(q.customer_email)}` : ''}</div><div><span>Project</span><strong>${esc(q.title)}</strong></div></div>
    ${sysRows.length ? `<div class="q-system">${sysRows.map(([k, v]) => `<div><span>${k}</span><strong>${esc(v)}</strong></div>`).join('')}</div>` : ''}
    <table><thead><tr><th style="width:48%">Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>
      ${(q.items || []).map((i) => `<tr><td><strong>${esc(i.description)}</strong>${i.detail ? `<br><span style="color:#5b6b52;font-size:13px">${esc(i.detail)}</span>` : ''}</td><td class="num">${i.qty} ${esc(i.unit || '')}</td><td class="num">${naira(i.unit_price)}</td><td class="num">${naira(i.total)}</td></tr>`).join('')}
    </tbody></table>
    <div class="totals"><div><span>Subtotal</span><span>${naira(q.subtotal)}</span></div>${q.discount ? `<div><span>Discount</span><span>− ${naira(q.discount)}</span></div>` : ''}<div><span>VAT (${q.vat_rate}%)</span><span>${naira(q.vat)}</span></div><div class="grand"><span>Total</span><span>${naira(q.total)}</span></div></div>
    ${q.notes ? `<h3 style="font-size:16px;margin-top:28px">Notes</h3><p style="white-space:pre-line;font-size:14px">${esc(q.notes)}</p>` : ''}
    ${q.terms ? `<h3 style="font-size:16px;margin-top:20px">Terms</h3><p style="white-space:pre-line;font-size:13px;color:#3d4a35">${esc(q.terms)}</p>` : ''}
    ${bank ? `<h3 style="font-size:16px;margin-top:20px">Payment details</h3><p style="white-space:pre-line;font-size:13px">${esc(bank)}</p><p style="font-size:12px;color:#5b6b52">Use ${esc(q.number)} as your payment reference.</p>` : ''}
    ${q.accepted_name && q.status === 'accepted' ? `<p style="margin-top:24px;padding:12px;border-radius:10px;background:#EEF5E4;font-size:14px"><strong>Accepted</strong> by ${esc(q.accepted_name)} on ${fmtDate(q.responded_at)}</p>` : ''}
    <footer style="margin-top:32px;padding-top:14px;border-top:1px solid #e3ead8;font-size:12px;color:#5b6b52;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><span>Thank you for choosing ${esc(company.name)}.</span><span>verticalsolar.com.ng</span></footer>
  </article>`;
}

export async function downloadPdf(el, filename) {
  if (!window.html2pdf) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/assets/vendor/html2pdf.bundle.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  await window.html2pdf().set({ margin: [8, 8, 10, 8], filename, image: { type: 'jpeg', quality: .96 }, html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['avoid-all', 'css'] } }).from(el).save();
}

export default async function () {
  const token = location.pathname.split('/').pop();
  const preview = new URLSearchParams(location.search).get('preview') === '1' ? '?preview=1' : '';
  const root = $('[data-quote-root]');
  let data;
  try { data = await api(`/api/public/quote/${encodeURIComponent(token)}${preview}`); }
  catch (e) { root.innerHTML = `<div class="empty"><i class="ri-file-unknow-line" aria-hidden="true"></i>${esc(e.message)}</div>`; return; }
  const { quote: q, company, bank } = data;
  document.title = `Quote ${q.number} | Vertical Solar`;
  root.innerHTML = quoteHtml(q, company, bank);
  $('[data-quote-actions]').hidden = false;
  $('[data-q-status]').textContent = q.status;
  $('[data-print]').addEventListener('click', () => print());
  $('[data-pdf]').addEventListener('click', async (e) => { const b = e.currentTarget; b.classList.add('is-loading'); try { await downloadPdf($('#quote-doc'), `Vertical-Solar-${q.number}.pdf`); } finally { b.classList.remove('is-loading'); } });
  if (['sent', 'viewed'].includes(q.status)) {
    $('[data-respond]').hidden = false;
    const form = $('[data-respond-form]'), st = $('.form-status', form);
    const respond = async (action) => {
      const body = { action, name: $('#acc-name').value.trim(), note: $('#acc-note').value.trim() };
      try { await api(`/api/public/quote/${encodeURIComponent(token)}/respond`, { body }); $('[data-respond]').innerHTML = `<div class="form-success"><i class="ri-checkbox-circle-line" aria-hidden="true"></i><h2>${action === 'accept' ? 'Thank you — quote accepted' : 'Response recorded'}</h2><p class="muted">${action === 'accept' ? 'Our team will call you to schedule installation.' : 'Thanks for letting us know. We are happy to revise the quote if you need changes.'}</p></div>`; $('[data-q-status]').textContent = action === 'accept' ? 'accepted' : 'declined'; }
      catch (err) { st.hidden = false; st.className = 'form-status err'; st.textContent = err.message; }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); if (!$('#acc-name').value.trim()) { $('#acc-name').reportValidity(); return; } respond('accept'); });
    $('[data-decline]').addEventListener('click', () => respond('decline'));
  }
}
