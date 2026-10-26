import { $, $$, api, esc, toast, fail, copy } from '../lib.js';

const TASKS = [
  ['pipeline', 'ri-route-line', 'Who should I call this week?', 'Review the pipeline and tell me who to call first.'],
  ['sizing', 'ri-calculator-line', 'Size a system', 'Customer wants to run 2 inverter ACs (1.5HP) for 6 hours at night, a fridge, a freezer, 15 LED bulbs, 4 fans, 2 TVs and a pumping machine. They want 8 hours of backup.'],
  ['objection', 'ri-chat-forward-line', 'Handle an objection', 'The customer says solar is too expensive compared to their generator.'],
  ['chat', 'ri-quill-pen-line', 'Write a promo message', 'Write a short WhatsApp broadcast announcing our harmattan panel-cleaning and maintenance offer.'],
];

export default async function ({ root, setTitle }) {
  setTitle('AI sales assistant', 'Ask for call priorities, system sizing, objection handling and ready-to-send messages');
  root.innerHTML = `<div class="grid g-12"><div class="stack">${TASKS.map(([t, i, l, p]) => `<button class="card card-b row" style="text-align:left;cursor:pointer;border:1px solid var(--line)" data-task="${t}" data-prompt="${esc(p)}"><span class="card-icon"><i class="${i}"></i></span><div><strong>${esc(l)}</strong><div class="muted small">${esc(p.slice(0, 80))}…</div></div></button>`).join('')}
      <div class="alert info small"><i class="ri-information-line"></i><span>On a customer's page you can also get an AI summary or a personalised follow-up message. AI suggestions should be checked before sending.</span></div></div>
    <div class="card" style="display:flex;flex-direction:column;min-height:70vh"><div class="chat-msgs" data-log style="border-radius:14px 14px 0 0"><div class="bubble assistant">Hi! I know your packages and can see your pipeline. Pick a task on the left or ask me anything about selling solar.</div></div>
      <form class="row" data-f style="padding:12px;border-top:1px solid var(--line);flex-wrap:nowrap;align-items:flex-end"><textarea class="input grow" name="p" rows="2" placeholder="Ask the assistant…" required></textarea><button class="btn btn-primary"><i class="ri-send-plane-2-line"></i></button></form></div></div>`;
  const log = $('[data-log]', root);
  const history = [];
  let task = 'chat';
  const add = (role, text) => {
    const d = document.createElement('div'); d.className = `bubble ${role === 'user' ? 'user' : 'assistant'}`;
    d.innerHTML = `<div class="ai-reply">${esc(text)}</div>${role !== 'user' ? '<div class="meta"><button class="btn btn-sm btn-ghost" data-cp><i class="ri-file-copy-line"></i> Copy</button></div>' : ''}`;
    d.querySelector('[data-cp]')?.addEventListener('click', () => copy(text));
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  };
  async function ask(prompt) {
    add('user', prompt);
    const wait = document.createElement('div'); wait.className = 'bubble assistant'; wait.textContent = 'Thinking…'; log.appendChild(wait);
    try { const r = await api('/api/admin/ai/assist', { body: { task, prompt, history } }); wait.remove(); add('assistant', r.reply); history.push({ role: 'user', content: prompt }, { role: 'assistant', content: r.reply }); }
    catch (err) { wait.remove(); fail(err); }
    task = 'chat';
  }
  $$('[data-task]', root).forEach((b) => (b.onclick = () => { task = b.dataset.task; if (task === 'pipeline') ask(b.dataset.prompt); else { $('[name=p]', root).value = b.dataset.prompt; $('[name=p]', root).focus(); } }));
  $('[data-f]', root).onsubmit = (e) => { e.preventDefault(); const v = e.target.p.value.trim(); if (!v) return; e.target.p.value = ''; ask(v); };
  $('[name=p]', root).onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('[data-f]', root).requestSubmit(); } };
}
