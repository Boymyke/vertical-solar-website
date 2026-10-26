import { $, $$, api, esc, datetime, ago, toast, fail, debounce, statusPill } from '../lib.js';

const FLAG = (cc) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '');
const LANG = { en: 'English', ig: 'Igbo', ha: 'Hausa', yo: 'Yorùbá' };

export default async function ({ root, params, setTitle }) {
  setTitle('Website chats', 'Every conversation visitors had with Vola, the AI assistant — text and voice. Take over to reply as a human.');
  root.innerHTML = `<div class="card chat-layout"><div class="chat-list"><div class="toolbar"><div class="search" style="max-width:none"><i class="ri-search-line"></i><input class="input" data-q placeholder="Search conversations"></div></div><div data-list></div></div><div class="chat-thread" data-thread><div class="empty" style="margin:auto"><i class="ri-chat-3-line"></i>Select a conversation.</div></div></div>`;
  let q = '';
  async function load() {
    const r = await api(`/api/admin/chats${q ? '?q=' + encodeURIComponent(q) : ''}`);
    $('[data-list]', root).innerHTML = r.items.map((c) => `<a class="li" href="#/chats/${c.id}" style="text-decoration:none;color:inherit;${c.id === params[0] ? 'background:var(--surface-2)' : ''}"><span class="li-icon"><i class="${c.voice ? 'ri-mic-line' : 'ri-chat-smile-3-line'}"></i></span>
      <div class="body"><strong class="nowrap" style="display:block;overflow:hidden;text-overflow:ellipsis">${esc(c.contact_name || c.first_message || 'Visitor')}</strong><div class="meta nowrap" style="overflow:hidden;text-overflow:ellipsis">${FLAG(c.country)} ${esc(c.city || '')} · ${c.messages_count} msgs · ${ago(c.updated_at)}</div></div>
      ${c.customer_id ? '<span class="pill ok">lead</span>' : c.status === 'human' ? statusPill('human') : ''}</a>`).join('') || '<div class="empty">No conversations yet.</div>';
  }
  async function thread(id) {
    const r = await api(`/api/admin/chats/${id}`);
    const c = r.chat;
    $('[data-thread]', root).innerHTML = `<div class="card-h"><div><h2>${esc(c.contact_name || 'Website visitor')}</h2><div class="sub">${FLAG(c.country)} ${esc([c.city, c.country].filter(Boolean).join(', '))} · ${LANG[c.lang] || c.lang} · started on ${esc(c.page || '/')} · ${datetime(c.created_at)}${c.voice ? ' · used voice' : ''}</div></div>
      <div class="row" style="margin-left:auto">${c.customer_id ? `<a class="btn btn-sm" href="#/customers/${c.customer_id}"><i class="ri-user-line"></i> Lead</a>` : ''}${c.contact_phone ? `<a class="btn btn-sm" href="tel:${esc(c.contact_phone)}"><i class="ri-phone-line"></i></a>` : ''}
      ${c.status === 'human' ? '<button class="btn btn-sm" data-st="open"><i class="ri-robot-2-line"></i> Hand back to AI</button>' : '<button class="btn btn-sm" data-st="human"><i class="ri-user-voice-line"></i> Take over</button>'}</div></div>
      <div class="chat-msgs">${r.messages.map((m) => `<div class="bubble ${m.role}">${esc(m.content)}<div class="meta">${m.role === 'user' ? 'Visitor' : m.role === 'agent' ? esc(m.agent_name || 'Staff') : 'Vola (AI)'} · ${datetime(m.created_at)}${m.mode === 'voice' ? ' · <i class="ri-mic-line"></i> voice' : ''}</div></div>`).join('')}</div>
      <form class="row" data-reply style="padding:12px;border-top:1px solid var(--line);flex-wrap:nowrap"><input class="input grow" name="content" placeholder="Reply to the visitor as a team member…" required><button class="btn btn-primary"><i class="ri-send-plane-2-line"></i> Send</button></form>
      <p class="muted small" style="margin:0 12px 10px">Replying takes over the chat — the AI stops answering until you hand it back. The visitor sees your message if their chat window is open.</p>`;
    const box = $('.chat-msgs', root); box.scrollTop = box.scrollHeight;
    $('[data-reply]', root).onsubmit = async (e) => { e.preventDefault(); try { await api(`/api/admin/chats/${id}/reply`, { body: { content: e.target.content.value } }); thread(id); } catch (err) { fail(err); } };
    $$('[data-st]', root).forEach((b) => (b.onclick = async () => { await api(`/api/admin/chats/${id}/status`, { body: { status: b.dataset.st } }); toast(b.dataset.st === 'human' ? 'You are now handling this chat' : 'AI assistant resumed'); thread(id); load(); }));
  }
  $('[data-q]', root).oninput = debounce((e) => { q = e.target.value; load(); });
  await load();
  if (params[0]) thread(params[0]);
}
