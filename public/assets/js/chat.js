// "Sola" — the Vertical Solar AI assistant. Text chat, voice dictation and hands-free voice conversation.
import { $, esc, api, store, getSite } from './core.js';
import { currentLang, LANGS } from './i18n.js';

const SPEECH_LANG = { en: 'en-NG', ig: 'ig-NG', ha: 'ha-NG', yo: 'yo-NG' };
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let state = { chatId: store.get('vs-chat-id'), open: false, lastAgentId: 0, busy: false };
let panel, log, input, site;

function md(text) {
  let h = esc(text);
  const links = [];
  h = h.replace(/\[([^\]]{1,80})\]\(((?:\/|https:\/\/wa\.me\/|tel:|mailto:)[^\s)]{0,200})\)/g, (_, label, url) => {
    links.push({ label, url });
    const ext = url.startsWith('https://') ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${url}"${ext}>${label}</a>`;
  });
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/^\s*[-•]\s+/gm, '• ');
  return { html: h, links };
}

function plain(text) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_#>`]/g, '').replace(/₦/g, 'naira ').trim();
}

function addMsg(role, text, { speakable = true, raw = false } = {}) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  // Visitor messages and AI/agent replies are already in the visitor's language — never re-translate them.
  if (role === 'user' || raw) div.setAttribute('translate', 'no');
  if (role === 'user') div.textContent = text;
  else {
    const { html, links } = md(text);
    div.innerHTML = html + (links.length ? `<div class="links">${links.map((l) => `<a href="${l.url}"><i class="ri-arrow-right-up-line" aria-hidden="true"></i>${l.label}</a>`).join('')}</div>` : '') +
      (speakable && 'speechSynthesis' in window ? `<button class="speak" type="button"><i class="ri-volume-up-line" aria-hidden="true"></i> Listen</button>` : '');
    div.querySelector('.speak')?.addEventListener('click', () => speak(text));
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function typing(on) {
  let t = $('.typing', log);
  if (on && !t) { t = document.createElement('div'); t.className = 'msg bot typing'; t.innerHTML = '<span></span><span></span><span></span>'; t.setAttribute('aria-label', 'Sola is typing'); log.appendChild(t); log.scrollTop = log.scrollHeight; }
  if (!on && t) t.remove();
}

function speak(text, onend) {
  if (!('speechSynthesis' in window)) { onend?.(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plain(text));
  const l = currentLang();
  const vs = speechSynthesis.getVoices();
  const v = vs.find((x) => x.lang.toLowerCase().startsWith(l)) || vs.find((x) => /en-NG/i.test(x.lang)) || vs.find((x) => /en-GB/i.test(x.lang)) || vs.find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  u.rate = 1.02;
  u.onend = () => onend?.();
  u.onerror = () => onend?.();
  speechSynthesis.speak(u);
}

async function send(text, mode = 'text') {
  text = text.trim();
  if (!text || state.busy) return null;
  state.busy = true;
  addMsg('user', text);
  typing(true);
  try {
    const r = await api('/api/public/chat', { body: { chat_id: state.chatId, message: text, lang: currentLang(), mode, page: location.pathname, visitor_id: store.get('vs-vid') } });
    state.chatId = r.chat_id; store.set('vs-chat-id', r.chat_id);
    typing(false);
    if (r.reply) { addMsg('bot', r.reply, { raw: true }); saveHistory(); return r.reply; }
    if (r.human) { addMsg('bot', 'A team member is handling this conversation and will reply here shortly.', { speakable: false }); }
  } catch (e) {
    typing(false);
    addMsg('bot', e.message || 'Something went wrong. Please try again, or chat with us on WhatsApp.', { speakable: false });
  } finally { state.busy = false; }
  return null;
}

function saveHistory() {
  const items = [...log.querySelectorAll('.msg:not(.typing)')].slice(-30).map((m) => ({ r: m.classList.contains('user') ? 'user' : m.classList.contains('agent') ? 'agent' : 'bot', t: m.dataset.raw || m.innerText.replace(/\nListen$/, '') }));
  try { sessionStorage.setItem('vs-chat-log', JSON.stringify(items)); } catch {}
}

// Push-to-talk dictation into the text box.
let rec = null, mediaRec = null;
async function dictate(btn) {
  if (rec || mediaRec) { rec?.stop(); mediaRec?.stop(); return; }
  if (SR) {
    rec = new SR();
    rec.lang = SPEECH_LANG[currentLang()] || 'en-NG';
    rec.interimResults = true;
    btn.classList.add('rec'); btn.setAttribute('aria-pressed', 'true');
    rec.onresult = (e) => { input.value = [...e.results].map((r) => r[0].transcript).join(' '); autoGrow(); };
    rec.onend = () => { rec = null; btn.classList.remove('rec'); btn.setAttribute('aria-pressed', 'false'); input.focus(); };
    rec.onerror = () => rec?.stop();
    rec.start();
  } else {
    const text = await recordAndTranscribe(btn);
    if (text) { input.value = text; autoGrow(); input.focus(); }
  }
}

async function recordAndTranscribe(btn, maxMs = 15000) {
  if (!navigator.mediaDevices?.getUserMedia) { alert('Voice input is not supported in this browser.'); return ''; }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return new Promise((resolve) => {
    const chunks = [];
    mediaRec = new MediaRecorder(stream);
    btn?.classList.add('rec');
    mediaRec.ondataavailable = (e) => chunks.push(e.data);
    mediaRec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      btn?.classList.remove('rec');
      mediaRec = null;
      try {
        const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
        const r = await fetch(`/api/public/transcribe?lang=${currentLang()}`, { method: 'POST', body: blob });
        const d = await r.json();
        resolve(d.text || '');
      } catch { resolve(''); }
    };
    mediaRec.start();
    setTimeout(() => mediaRec?.state === 'recording' && mediaRec.stop(), maxMs);
  });
}

// Hands-free voice conversation: listen → think → speak → listen again.
let voice = { on: false, stage: null };
function voiceUi(status, text) {
  if (!voice.stage) return;
  const orb = $('.orb', voice.stage);
  orb.className = `orb ${status}`;
  $('[data-vstatus]', voice.stage).textContent = { listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…', idle: 'Tap the orb to talk' }[status];
  if (text != null) $('[data-vtext]', voice.stage).textContent = text;
}
function listenOnce() {
  if (!voice.on) return;
  voiceUi('listening', '');
  const done = async (heard) => {
    if (!voice.on) return;
    if (!heard) { voiceUi('idle', 'I didn’t catch that. Tap the orb and try again.'); return; }
    voiceUi('thinking', `“${heard}”`);
    const reply = await send(heard, 'voice');
    if (!voice.on) return;
    if (reply) { voiceUi('speaking', plain(reply).slice(0, 220)); speak(reply, () => voice.on && listenOnce()); }
    else voiceUi('idle');
  };
  if (SR) {
    const r = new SR();
    r.lang = SPEECH_LANG[currentLang()] || 'en-NG';
    r.interimResults = true;
    let final = '';
    r.onresult = (e) => { final = [...e.results].map((x) => x[0].transcript).join(' '); $('[data-vtext]', voice.stage).textContent = final; };
    r.onend = () => done(final.trim());
    r.onerror = () => {};
    voice.rec = r;
    r.start();
  } else {
    recordAndTranscribe(null, 8000).then(done);
  }
}
function openVoice() {
  if (voice.stage) return;
  voice.on = true;
  voice.stage = document.createElement('div');
  voice.stage.className = 'voice-stage';
  voice.stage.innerHTML = `<button class="orb" type="button" aria-label="Talk to Sola"></button><strong data-vstatus aria-live="polite"></strong><p data-vtext></p>
    <div class="btn-row"><button class="btn btn-light btn-sm" type="button" data-vend><i class="ri-keyboard-line" aria-hidden="true"></i> Back to typing</button></div>
    <small style="opacity:.7">Speaks ${LANGS[currentLang()]}. Voice works best in Chrome or Edge.</small>`;
  panel.appendChild(voice.stage);
  $('.orb', voice.stage).addEventListener('click', () => { speechSynthesis?.cancel(); voice.rec?.abort?.(); listenOnce(); });
  $('[data-vend]', voice.stage).addEventListener('click', closeVoice);
  listenOnce();
}
function closeVoice() {
  voice.on = false;
  voice.rec?.abort?.();
  speechSynthesis?.cancel();
  voice.stage?.remove();
  voice.stage = null;
  input?.focus();
}

function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; }

async function pollAgent() {
  if (!state.chatId || !state.open) return;
  try {
    const r = await api(`/api/public/chat/${state.chatId}?after=${state.lastAgentId}`);
    for (const m of r.messages) {
      if (m.role === 'agent' && m.id > state.lastAgentId) { const d = addMsg('agent', m.content, { speakable: true, raw: true }); d.classList.remove('bot'); }
      state.lastAgentId = Math.max(state.lastAgentId, m.id);
    }
  } catch {}
}

function build() {
  panel = document.createElement('section');
  panel.className = 'chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat with Sola, the Vertical Solar assistant');
  const name = site?.ai?.assistant_name || 'Sola';
  panel.innerHTML = `
    <div class="chat-head"><span class="avatar"><i class="ri-sun-line" aria-hidden="true"></i></span><div><strong>${esc(name)}</strong><small>Vertical Solar assistant</small></div>
      ${site?.features?.voice_enabled !== false ? '<button class="icon-btn" type="button" data-voice aria-label="Start a voice conversation"><i class="ri-voiceprint-line" aria-hidden="true"></i></button>' : ''}
      <button class="icon-btn" type="button" data-close aria-label="Close chat"><i class="ri-close-line" aria-hidden="true"></i></button></div>
    <div class="chat-log" aria-live="polite"></div>
    <div class="chips"></div>
    <form class="chat-input"><label class="sr-only" for="chat-text">Message</label>
      <textarea id="chat-text" rows="1" placeholder="Ask about packages, prices, financing…" maxlength="1500"></textarea>
      <button class="icon-btn mic" type="button" aria-label="Speak your message" aria-pressed="false"><i class="ri-mic-line" aria-hidden="true"></i></button>
      <button class="icon-btn send" type="submit" aria-label="Send"><i class="ri-send-plane-2-fill" aria-hidden="true"></i></button></form>
    <div class="chat-foot">AI answers can be wrong — our team confirms all quotes. <a href="/privacy">Privacy</a></div>`;
  document.body.appendChild(panel);
  log = $('.chat-log', panel);
  input = $('textarea', panel);
  const chips = $('.chips', panel);
  const prompts = ['Which package suits my home?', 'How much is a 5kVA system?', 'Do you offer pay-monthly?', 'Book a free site survey', 'My inverter is beeping'];
  chips.innerHTML = prompts.map((p) => `<button type="button">${esc(p)}</button>`).join('');
  chips.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { chips.remove(); send(b.textContent); } });
  $('form', panel).addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; autoGrow(); send(v); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('form', panel).requestSubmit(); } });
  input.addEventListener('input', autoGrow);
  $('.mic', panel).addEventListener('click', (e) => dictate(e.currentTarget));
  $('[data-close]', panel).addEventListener('click', () => toggle(false));
  $('[data-voice]', panel)?.addEventListener('click', openVoice);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });

  let restored = [];
  try { restored = JSON.parse(sessionStorage.getItem('vs-chat-log') || '[]'); } catch {}
  if (restored.length) { restored.forEach((m) => addMsg(m.r === 'user' ? 'user' : 'bot', m.t, { speakable: m.r !== 'user', raw: true })); chips.remove(); }
  else addMsg('bot', site?.ai?.greeting || "Hi, I'm Sola. Ask me about solar packages, prices, financing or caring for your system.", { speakable: false });
}

export function toggle(open = !state.open) {
  if (open && !panel) build();
  state.open = open;
  if (!panel) return;
  panel.hidden = !open;
  document.querySelector('.fab-chat')?.setAttribute('aria-expanded', String(open));
  document.querySelector('.fab-chat .ping')?.remove();
  if (open) { input.focus(); pollAgent(); } else { closeVoice(); document.querySelector('.fab-chat')?.focus(); }
}

export async function initChat() {
  site = await getSite();
  if (site && site.features?.chat_enabled === false) return;
  const stack = document.querySelector('.fab-stack');
  const fab = document.createElement('button');
  fab.className = 'fab fab-chat';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Chat with our solar assistant');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = '<i class="ri-chat-smile-3-line" aria-hidden="true"></i><span class="ping" aria-hidden="true"></span>';
  fab.addEventListener('click', () => toggle());
  stack?.appendChild(fab);
  document.addEventListener('click', (e) => { if (e.target.closest('[data-open-chat]')) { e.preventDefault(); toggle(true); } });
  setInterval(pollAgent, 15000);
}
