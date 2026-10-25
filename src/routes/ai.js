// AI: website chatbot (text + voice), speech-to-text, and the CRM's AI Sales Assistant.
import { json, ok, fail, readJson, clientIp } from '../lib/http.js';
import { rateLimit, notify, requirePerm } from '../lib/auth.js';
import { getSettings, SITE_PAGES } from '../lib/site.js';
import { str, num, parseJSON, now, randomToken, naira } from '../lib/util.js';
import { upsertLead } from './public.js';

const LANG_NAMES = { en: 'English', ig: 'Igbo', ha: 'Hausa', yo: 'Yoruba', pcm: 'Nigerian Pidgin English' };

async function buildKnowledge(env) {
  const [s, branches, pkgs, faqs, products] = await Promise.all([
    getSettings(env),
    env.DB.prepare('SELECT name, address, phones, hours FROM branches ORDER BY is_hq DESC, sort').all(),
    env.DB.prepare('SELECT name, tagline, inverter_kva, pv_wp, battery_kwh, loads, price_lead_acid, price_lithium FROM packages WHERE published=1 ORDER BY sort').all(),
    env.DB.prepare('SELECT question, answer FROM faqs WHERE published=1 ORDER BY sort LIMIT 20').all(),
    env.DB.prepare('SELECT name, slug, category, price, stock FROM products WHERE in_shop=1 AND active=1 ORDER BY featured DESC LIMIT 30').all(),
  ]);
  const c = s.company;
  const lines = [];
  lines.push(`COMPANY: ${c.name} (${c.legal_name}), founded ${c.founded}, head office: ${c.address}. Phones: ${c.phones.join(', ')}. WhatsApp: +${c.whatsapp}. Email: ${c.email}. Hours: ${c.hours}.`);
  lines.push(`WHAT WE DO: design, supply, installation and maintenance of solar PV, hybrid inverter and battery (lead-acid & lithium-ion) systems for homes, businesses, industry and government across Nigeria. Free load audit / site survey. Flexible financing: ${s.financing.headline} — ${s.financing.summary}`);
  lines.push('BRANCHES: ' + branches.results.map((b) => `${b.name}: ${b.address} (tel ${parseJSON(b.phones, []).join(', ')})`).join(' | '));
  lines.push('PACKAGES (starting prices, final price confirmed after site survey): ' + pkgs.results.map((p) =>
    `${p.name} — ${p.inverter_kva}kVA inverter, ${p.pv_wp}Wp panels, ${p.battery_kwh}kWh storage; runs ${p.loads}; from ${naira(p.price_lead_acid)} lead-acid${p.price_lithium ? ' / ' + naira(p.price_lithium) + ' lithium' : ''}`).join(' | '));
  if (s.shop.enabled && products.results.length) {
    lines.push('SHOP ITEMS: ' + products.results.map((p) => `${p.name} ${naira(p.price)}${p.stock > 0 ? '' : ' (out of stock)'} → /shop/${p.slug}`).join(' | '));
  }
  lines.push('FAQ: ' + faqs.results.map((f) => `Q: ${f.question} A: ${f.answer}`).join(' || '));
  lines.push('SITE PAGES YOU CAN LINK: ' + SITE_PAGES.map(([p, d]) => `${p} = ${d}`).join('; '));
  if (s.ai.extra_knowledge) lines.push('EXTRA NOTES FROM MANAGEMENT: ' + s.ai.extra_knowledge);
  return { text: lines.join('\n'), settings: s };
}

function systemPrompt(knowledge, settings, lang) {
  const name = settings.ai.assistant_name || 'Sola';
  return `You are ${name}, the friendly, professional virtual assistant on the website of ${settings.company.name} (Nigeria).
Only help with topics related to ${settings.company.name}, solar energy, inverters, batteries, power needs, pricing, financing, installation, maintenance and our services. Politely decline unrelated requests.
Rules:
- Reply in ${LANG_NAMES[lang] || 'English'}. Keep answers short (2–5 sentences or a few bullets), warm and clear. Use ₦ for prices.
- Use only the facts below. Never invent prices, stock, guarantees or staff names. If unsure, say a specialist will confirm and offer a free site survey.
- When relevant, include 1–3 helpful links to our pages as markdown, e.g. [See packages](/packages). Only use paths from SITE PAGES or SHOP ITEMS.
- To size a system, ask what appliances they want to run and for how many hours, or point them to the load calculator at /packages#calculator.
- If the visitor wants a quote, a call back, or seems ready to buy, ask for their name and phone number (or WhatsApp). Once given, confirm the team will call within 24 hours.
- For faults or emergencies, give basic safety advice (switch off the inverter/breaker, do not open battery terminals) and link /support.
- Never ask for card or bank details.
FACTS:
${knowledge}`;
}

const PHONE_RE = /(\+?234|0)[789][01]\d{8}/;

export async function runChat(env, messages, { maxTokens = 600, temperature = 0.4, fast = false } = {}) {
  const model = fast ? env.AI_FAST_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast' : env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  try {
    const res = await env.AI.run(model, { messages, max_tokens: maxTokens, temperature });
    return (res?.response ?? res?.choices?.[0]?.message?.content ?? '').trim();
  } catch (e) {
    console.error('AI error', e);
    if (!fast) return runChat(env, messages, { maxTokens, temperature, fast: true });
    throw e;
  }
}

export function registerAI(r) {
  r.post('/api/public/chat', async (req, env, _p, ctx) => {
    const ip = clientIp(req);
    await rateLimit(env, `chat:${ip}`, 40, 600);
    const b = await readJson(req, 16 * 1024);
    const message = str(b.message, 1500);
    if (!message) fail(400, 'Message is empty');
    const lang = LANG_NAMES[b.lang] ? b.lang : 'en';
    const mode = b.mode === 'voice' ? 'voice' : 'text';
    let chatId = str(b.chat_id, 40);
    let chat = chatId ? await env.DB.prepare('SELECT * FROM chats WHERE id=?').bind(chatId).first() : null;
    if (!chat) {
      chatId = randomToken(12);
      const cf = req.cf || {};
      await env.DB.prepare('INSERT INTO chats (id, visitor_id, lang, country, city, page, voice) VALUES (?,?,?,?,?,?,?)')
        .bind(chatId, str(b.visitor_id, 40), lang, cf.country || null, cf.city || null, str(b.page, 200), mode === 'voice' ? 1 : 0).run();
      chat = { id: chatId, status: 'open' };
    }
    await env.DB.prepare('INSERT INTO chat_messages (chat_id, role, content, mode) VALUES (?,?,?,?)').bind(chatId, 'user', message, mode).run();

    // Lead capture: a Nigerian phone number in the message creates/updates a CRM lead.
    const phoneMatch = message.match(PHONE_RE);
    if (phoneMatch) {
      const nameGuess = str(b.name, 80) || (message.match(/(?:my name is|i am|i'm|name:)\s+([A-Za-z][A-Za-z' -]{1,40})/i)?.[1] ?? '').trim() || chat.contact_name || 'Chat visitor';
      const { rows } = { rows: (await env.DB.prepare('SELECT role, content FROM chat_messages WHERE chat_id=? ORDER BY id DESC LIMIT 12').bind(chatId).all()).results.reverse() };
      const transcript = rows.map((m) => `${m.role === 'user' ? 'Visitor' : 'Bot'}: ${m.content}`).join('\n').slice(0, 1800);
      const { id: cid, isNew } = await upsertLead(env, { name: nameGuess, phone: phoneMatch[0], source: 'chatbot', note: `AI chat lead (chat ${chatId}):\n${transcript}` });
      await env.DB.prepare('UPDATE chats SET customer_id=?, contact_name=?, contact_phone=? WHERE id=?').bind(cid, nameGuess, phoneMatch[0], chatId).run();
      await notify(env, { module: 'crm', type: 'success', title: `${isNew ? 'New' : 'Returning'} lead from AI chat`, body: `${nameGuess} · ${phoneMatch[0]}`, link: `/admin/#/customers/${cid}` });
    }

    if (chat.status === 'human') {
      await env.DB.prepare('UPDATE chats SET messages_count=messages_count+1, updated_at=? WHERE id=?').bind(now(), chatId).run();
      await notify(env, { module: 'chats', type: 'info', title: 'Visitor replied in live chat', body: message.slice(0, 120), link: `/admin/#/chats/${chatId}` });
      return json({ chat_id: chatId, reply: null, human: true });
    }

    const history = (await env.DB.prepare('SELECT role, content FROM chat_messages WHERE chat_id=? ORDER BY id DESC LIMIT 14').bind(chatId).all()).results.reverse();
    const { text, settings } = await buildKnowledge(env);
    const messages = [{ role: 'system', content: systemPrompt(text, settings, lang) },
      ...history.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))];
    let reply;
    try {
      reply = await runChat(env, messages, { maxTokens: mode === 'voice' ? 280 : 600 });
    } catch {
      reply = `Sorry, I'm having trouble right now. Please call ${settings.company.phones[0]} or chat with us on WhatsApp — or leave your number here and we'll call you.`;
    }
    if (!reply) reply = 'Could you tell me a little more about what you need power for?';
    await env.DB.prepare('INSERT INTO chat_messages (chat_id, role, content, mode) VALUES (?,?,?,?)').bind(chatId, 'assistant', reply, mode).run();
    await env.DB.prepare(`UPDATE chats SET messages_count=messages_count+2, updated_at=?, voice=MAX(voice, ?) WHERE id=?`).bind(now(), mode === 'voice' ? 1 : 0, chatId).run();
    return json({ chat_id: chatId, reply });
  });

  // Visitor widget polls for human-agent replies.
  r.get('/api/public/chat/:id', async (req, env, { id }) => {
    const after = num(new URL(req.url).searchParams.get('after'), 0);
    const chat = await env.DB.prepare('SELECT id, status FROM chats WHERE id=?').bind(id).first();
    if (!chat) fail(404, 'Chat not found');
    const { results } = await env.DB.prepare(`SELECT id, role, content, created_at FROM chat_messages WHERE chat_id=? AND id>? AND role IN ('assistant','agent') ORDER BY id`).bind(id, after).all();
    return json({ status: chat.status, messages: results });
  });

  r.post('/api/public/transcribe', async (req, env) => {
    await rateLimit(env, `stt:${clientIp(req)}`, 30, 600);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) fail(400, 'No audio');
    if (buf.byteLength > 6 * 1024 * 1024) fail(413, 'Recording too long — please keep it under a minute');
    const lang = new URL(req.url).searchParams.get('lang');
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const input = { audio: btoa(bin) };
    if (lang && ['en', 'yo', 'ha'].includes(lang)) input.language = lang; // Whisper supports en/yo/ha; Igbo is auto-detected
    try {
      const res = await env.AI.run(env.STT_MODEL || '@cf/openai/whisper-large-v3-turbo', input);
      return json({ text: (res?.text || '').trim() });
    } catch (e) {
      console.error(e);
      fail(502, 'Could not transcribe audio');
    }
  });

  // ── CRM AI Sales Assistant ──
  r.post('/api/admin/ai/assist', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'ai', 'crm');
    await rateLimit(env, `ai:${ctx.user.id}`, 60, 600);
    const b = await readJson(req, 64 * 1024);
    const task = str(b.task, 40) || 'chat';
    const s = await getSettings(env);
    let context = '';
    if (b.customer_id) {
      const c = await env.DB.prepare('SELECT * FROM customers WHERE id=?').bind(num(b.customer_id)).first();
      if (c) {
        const acts = (await env.DB.prepare('SELECT type, body, created_at FROM activities WHERE customer_id=? ORDER BY id DESC LIMIT 15').bind(c.id).all()).results;
        const quotes = (await env.DB.prepare('SELECT number, title, status, total, created_at FROM quotes WHERE customer_id=? ORDER BY id DESC LIMIT 5').bind(c.id).all()).results;
        const inst = (await env.DB.prepare('SELECT title, status, completed_at, next_maintenance_at, system FROM installations WHERE customer_id=? ORDER BY id DESC LIMIT 5').bind(c.id).all()).results;
        context = `CUSTOMER: ${JSON.stringify({ name: c.name, company: c.company, city: c.city, segment: c.segment, stage: c.stage, status: c.status, interest: c.interest, value: c.value_estimate, notes: c.notes, last_contacted_at: c.last_contacted_at })}
RECENT ACTIVITY: ${acts.map((a) => `[${a.created_at} ${a.type}] ${a.body}`).join(' | ').slice(0, 3000)}
QUOTES: ${JSON.stringify(quotes)}
INSTALLATIONS: ${JSON.stringify(inst)}`;
      }
    }
    if (task === 'pipeline') {
      const stages = (await env.DB.prepare(`SELECT stage, COUNT(*) n, SUM(value_estimate) v FROM customers WHERE status!='inactive' GROUP BY stage`).all()).results;
      const stale = (await env.DB.prepare(`SELECT name, stage, last_contacted_at FROM customers WHERE stage NOT IN ('won','lost') AND (last_contacted_at IS NULL OR last_contacted_at < datetime('now','-7 days')) ORDER BY value_estimate DESC LIMIT 15`).all()).results;
      const dueQuotes = (await env.DB.prepare(`SELECT q.number, c.name, q.status, q.total, q.sent_at FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id WHERE q.status IN ('sent','viewed') ORDER BY q.sent_at LIMIT 15`).all()).results;
      context += `\nPIPELINE BY STAGE: ${JSON.stringify(stages)}\nLEADS NOT CONTACTED IN 7+ DAYS: ${JSON.stringify(stale)}\nOPEN QUOTES AWAITING RESPONSE: ${JSON.stringify(dueQuotes)}`;
    }
    const instructions = {
      followup: 'Write a short, warm follow-up message the sales rep can send on WhatsApp (and a slightly more formal email version with a subject line). Reference what we know about the customer. No placeholders other than the rep name.',
      summary: 'Summarise this customer in 4–6 bullets: who they are, what they need, where they are in the pipeline, risks, and the single best next action with a suggested date.',
      objection: 'The customer raised the objection in the request. Give 3 concise, honest ways to respond, grounded in solar economics in Nigeria (diesel/grid costs, outages, financing). No made-up statistics.',
      sizing: 'Using the appliance/load description in the request, estimate daily energy (kWh), recommended inverter size (kVA), battery capacity (kWh) for the requested backup hours, and PV array size (kWp) assuming ~4.5 peak sun hours in Nigeria. Show the working briefly, then recommend the closest of our packages.',
      pipeline: 'Act as a sales manager. Review the pipeline data and give a prioritised action list for this week: who to call first and why, which quotes to chase, and any risks.',
      chat: 'Answer the sales team member helpfully and concisely.',
    }[task] || 'Answer the sales team member helpfully and concisely.';
    const pkgs = (await env.DB.prepare('SELECT name, inverter_kva, pv_wp, battery_kwh, price_lead_acid, price_lithium FROM packages WHERE published=1 ORDER BY sort').all()).results;
    const messages = [
      { role: 'system', content: `You are the AI Sales Assistant inside the CRM of ${s.company.name}, a Nigerian solar installation company. Be practical, specific and concise. Use ₦. Our packages: ${JSON.stringify(pkgs)}.\n${instructions}\n${context}` },
      ...(Array.isArray(b.history) ? b.history.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content).slice(0, 2000) })) : []),
      { role: 'user', content: str(b.prompt, 4000) || 'Go ahead.' },
    ];
    const reply = await runChat(env, messages, { maxTokens: 900, temperature: 0.5 });
    return ok({ reply });
  });
}
