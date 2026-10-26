import { $, $$, api, esc, datetime, toast, fail, table, statusPill, copy } from '../lib.js';

const TEMPLATES = {
  '': ['', ''],
  followup: ['Following up on your solar enquiry', 'Hello {name},\n\nThank you for your interest in Vertical Solar. I wanted to follow up on your enquiry and see if you have any questions about the system we discussed.\n\nWould you like us to book a free site survey this week?\n\nBest regards,\n'],
  maintenance: ['Time for your solar maintenance visit', 'Hello {name},\n\nYour solar system is due for its routine maintenance check. Regular servicing keeps your panels producing at their best and extends battery life.\n\nPlease reply with a convenient day and time, and our technician will visit.\n\nBest regards,\n'],
  thanks: ['Thank you for choosing Vertical Solar', 'Hello {name},\n\nThank you for choosing Vertical Solar. We hope you are enjoying uninterrupted power!\n\nIf you have a moment, we would love a short review and a photo of your installation. And if friends or family need solar, we would be grateful for the referral.\n\nBest regards,\n'],
};

export default async function ({ root, setTitle, can }) {
  setTitle('Email', 'Send emails to customers and subscribers');
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const st = await api('/api/admin/email/status');
  root.innerHTML = `<div class="grid g-21"><div class="card"><div class="card-h"><h2>Compose</h2>${st.configured ? `<span class="pill ok" style="margin-left:auto">Sending as ${esc(st.from_name)} &lt;${esc(st.from)}&gt;</span>` : '<span class="pill warn" style="margin-left:auto">Direct sending not set up</span>'}</div>
    <form class="card-b stack" data-f>
      <div class="field"><label for="to">To</label><input class="input" id="to" name="to" value="${esc(qs.get('to') || '')}" placeholder="name@example.com, another@example.com" required><span class="hint">Separate several addresses with commas. Each person receives an individual email.</span></div>
      <div class="field"><label for="tpl">Template</label><select class="input" id="tpl"><option value="">Blank</option><option value="followup">Enquiry follow-up</option><option value="maintenance">Maintenance reminder</option><option value="thanks">Thank-you &amp; review request</option></select></div>
      <div class="field"><label for="sub">Subject</label><input class="input" id="sub" name="subject" required></div>
      <div class="field"><label for="body">Message</label><textarea class="input" id="body" name="body" rows="12" required></textarea></div>
      <div class="row">${st.configured ? '<button class="btn btn-primary" type="submit"><i class="ri-mail-send-line"></i> Send from CRM</button>' : ''}
        <button class="btn" type="button" data-gmail><i class="ri-google-fill"></i> Open in Gmail</button><button class="btn" type="button" data-outlook><i class="ri-microsoft-fill"></i> Open in Outlook</button><button class="btn" type="button" data-mailto><i class="ri-mail-line"></i> Email app</button><button class="btn btn-ghost" type="button" data-copy><i class="ri-file-copy-line"></i> Copy</button></div>
      ${st.configured ? '' : `<div class="alert info"><i class="ri-information-line"></i><span>To send directly from the CRM (and keep a record here), the owner can connect a free <a href="https://resend.com" target="_blank" rel="noopener">Resend</a> account: add the <code>RESEND_API_KEY</code> secret in Cloudflare and set the "from" address in <a href="#/settings?tab=integrations">Settings → Integrations</a>. Until then, the buttons above open your usual email service with the message filled in.</span></div>`}
    </form></div>
    <div class="stack"><div class="card"><div class="card-h"><h2>Sent from CRM</h2></div><div data-sent></div></div>${can('email', 'website') ? '<div class="card"><div class="card-h"><h2>Newsletter subscribers</h2><button class="btn btn-sm" data-allsubs style="margin-left:auto">Email all</button></div><div data-subs></div></div>' : ''}</div></div>`;
  const f = $('[data-f]', root);
  const val = () => ({ to: f.to.value.trim(), subject: f.subject.value, body: f.body.value });
  $('#tpl', root).onchange = (e) => { const [s, b] = TEMPLATES[e.target.value]; f.subject.value = s; f.body.value = b; };
  $('[data-gmail]', root).onclick = () => { const v = val(); window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(v.to)}&su=${encodeURIComponent(v.subject)}&body=${encodeURIComponent(v.body)}`, '_blank', 'noopener'); };
  $('[data-outlook]', root).onclick = () => { const v = val(); window.open(`https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(v.to)}&subject=${encodeURIComponent(v.subject)}&body=${encodeURIComponent(v.body)}`, '_blank', 'noopener'); };
  $('[data-mailto]', root).onclick = () => { const v = val(); location.href = `mailto:${v.to}?subject=${encodeURIComponent(v.subject)}&body=${encodeURIComponent(v.body)}`; };
  $('[data-copy]', root).onclick = () => copy(`${val().subject}\n\n${val().body}`);
  f.onsubmit = async (e) => {
    e.preventDefault(); const btn = f.querySelector('[type=submit]'); btn.classList.add('loading');
    try { const r = await api('/api/admin/email/send', { body: { ...val(), customer_id: Number(qs.get('customer')) || null } }); const ok = r.results.filter((x) => x.status === 'sent').length; toast(`${ok} of ${r.results.length} sent`); loadSent(); } catch (err) { fail(err); } finally { btn.classList.remove('loading'); }
  };
  async function loadSent() {
    const r = await api('/api/admin/emails').catch(() => ({ items: [] }));
    $('[data-sent]', root).innerHTML = table({ rows: r.items.slice(0, 30), empty: 'No emails sent from the CRM yet.', columns: [{ label: 'To', render: (m) => `${esc(m.to_email)}<div class="muted small">${esc(m.subject)}</div>` }, { label: 'Status', render: (m) => statusPill(m.status) }, { label: 'When', render: (m) => datetime(m.created_at) }] });
  }
  loadSent();
  if ($('[data-subs]', root)) {
    const s = await api('/api/admin/subscribers?per=500').catch(() => ({ items: [] }));
    $('[data-subs]', root).innerHTML = table({ rows: s.items.slice(0, 50), empty: 'No subscribers yet.', columns: [{ label: 'Email', key: 'email' }, { label: 'Joined', render: (x) => datetime(x.created_at) }] });
    $('[data-allsubs]', root).onclick = () => { f.to.value = s.items.map((x) => x.email).join(', '); toast(`${s.items.length} subscribers added`); };
  }
}
