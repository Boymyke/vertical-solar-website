// Home page: live sky hero + CMS blocks.
import { $ } from '../core.js';
import { initScene } from '../scene.js';
import { fillBlocks } from '../render.js';
import { mountVideo } from '../media.js';

export default async function (site) {
  const status = $('[data-status]'), icon = $('[data-status-icon]');
  initScene($('[data-scene]'), {
    onStatus: ({ isDay, label, pct, charge, simulated }) => {
      if (!status) return;
      icon.className = isDay ? 'ri-sun-line' : 'ri-moon-clear-line';
      const prefix = simulated ? `${simulated === 'day' ? 'Day' : 'Night'} preview` : `Lagos ${label}`;
      status.textContent = isDay
        ? `${prefix} · Panels generating at ~${Math.max(pct, 5)}% of peak · Batteries charging`
        : `${prefix} · Sun is down · Homes running on stored battery power (${charge}%)`;
    },
  });
  const applyHero = () => {
    if (!site?.hero || (document.documentElement.lang || 'en') !== 'en') return;
    const h1 = $('#hero-title'), sub = $('.hero .lede');
    if (site.hero.headline && h1) { h1.textContent = site.hero.headline; h1.dataset.i18nEn = site.hero.headline; }
    if (site.hero.subheadline && sub) { sub.textContent = site.hero.subheadline; sub.dataset.i18nEn = site.hero.subheadline; }
  };
  applyHero();
  await fillBlocks(site);
  const v = site?.videos?.[0];
  if (v?.url) {
    const sec = $('[data-video-section]'); sec.hidden = false;
    mountVideo($('[data-home-video]'), v.url, v.poster || '/images/site/team-installing-panels.webp', v.title || 'See how we install');
  }
}
