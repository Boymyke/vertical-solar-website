// The live sky: the hero photo follows the real time in Lagos.
// Day → the house in full sun, panels charging. Night → the same house lit by its batteries.
// Around sunrise and sunset the two photos blend, so the change feels like the light itself moving.

const SUNRISE = 6.6, SUNSET = 18.75; // average for Lagos
const TWILIGHT = 0.6; // hours either side of sunrise/sunset used for the blend

function lagosNow() {
  const n = new Date();
  const h = (n.getUTCHours() + 1 + n.getUTCMinutes() / 60) % 24;
  return { h, label: `${String(Math.floor(h)).padStart(2, '0')}:${String(n.getUTCMinutes()).padStart(2, '0')}` };
}

const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// 1 = full day photo, 0 = full night photo
function dayWeight(h) {
  if (h < SUNRISE - TWILIGHT || h > SUNSET + TWILIGHT) return 0;
  if (h < SUNRISE + TWILIGHT) return smooth((h - (SUNRISE - TWILIGHT)) / (2 * TWILIGHT));
  if (h > SUNSET - TWILIGHT) return 1 - smooth((h - (SUNSET - TWILIGHT)) / (2 * TWILIGHT));
  return 1;
}

const photo = (name, alt) => `<picture>
  <source type="image/webp" srcset="/images/hero/${name}-768.webp 768w, /images/hero/${name}-1536.webp 1536w" sizes="100vw">
  <img src="/images/hero/${name}-1536.webp" alt="${alt}" width="1536" height="1024" decoding="async" fetchpriority="${name === 'home-day' ? 'high' : 'low'}">
</picture>`;

export function initScene(el, { onStatus } = {}) {
  if (!el) return;
  el.innerHTML = `<div class="scene-layer scene-day">${photo('home-day', 'A Lagos home with rooftop solar panels in the midday sun')}</div>
  <div class="scene-layer scene-night">${photo('home-night', 'The same home at night, lights on from its solar batteries while the street is dark')}</div>
  <div class="scene-shade" aria-hidden="true"></div>`;
  const night = el.querySelector('.scene-night');

  function paint() {
    const mode = document.documentElement.getAttribute('data-theme-mode');
    const theme = document.documentElement.getAttribute('data-theme');
    const { h, label } = lagosNow();
    let w = dayWeight(h);
    if (mode && mode !== 'auto') w = theme === 'night' ? 0 : 1; // visitor picked day or night
    night.style.opacity = String(1 - w);
    el.dataset.phase = w > 0.5 ? 'day' : 'night';
    const isDay = w > 0.5;
    const frac = isDay ? Math.min(1, Math.max(0, (h - SUNRISE) / (SUNSET - SUNRISE))) : 0;
    const alt = mode && mode !== 'auto' ? (isDay ? 1 : 0) : Math.sin(Math.PI * frac);
    const mh = isDay ? 0 : ((h - SUNSET + 24) % 24) / (24 - (SUNSET - SUNRISE));
    const charge = isDay ? Math.min(1, 0.45 + frac * 0.55) : Math.max(0.25, 1 - mh * 0.7);
    if (onStatus) onStatus({ isDay, label, pct: Math.round(alt * 100), charge: Math.round(charge * 100), simulated: mode !== 'auto' && mode });
  }
  paint();
  const timer = setInterval(paint, 60000);
  window.addEventListener('vs:theme', paint);
  return () => clearInterval(timer);
}
