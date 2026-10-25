// FAQ: server-rendered for SEO; falls back to client render if needed.
import { $, api, esc } from '../core.js';
export default async function () {
  const box = $('[data-faq-list]');
  if (box.children.length) return;
  try {
    const items = await api('/api/public/faqs');
    box.innerHTML = items.map((f) => `<details><summary>${esc(f.question)}</summary><div>${esc(f.answer)}</div></details>`).join('');
  } catch { box.innerHTML = '<div class="empty">Could not load questions. Please refresh.</div>'; }
}
