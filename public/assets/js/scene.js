// The live sky: sun position and sky colour follow the real time in Lagos.
// Day → panels generate and feed home + battery. Night → navy sky, stars, battery feeds home.

const SUNRISE = 6.6, SUNSET = 18.75; // average for Lagos
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (arr) => '#' + arr.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => lerp(v, B[i], t))); };

function lagosNow() {
  const n = new Date();
  const h = (n.getUTCHours() + 1 + n.getUTCMinutes() / 60) % 24;
  return { h, label: `${String(Math.floor(h)).padStart(2, '0')}:${String(n.getUTCMinutes()).padStart(2, '0')}` };
}

function skyFor(h, forced) {
  // dayFrac 0 at sunrise → 1 at sunset; altitude 0..1..0
  let isDay = h >= SUNRISE && h < SUNSET;
  if (forced === 'day' && !isDay) { h = 12.5; isDay = true; }
  if (forced === 'night' && isDay) { h = 22; isDay = false; }
  const frac = isDay ? (h - SUNRISE) / (SUNSET - SUNRISE) : 0;
  const alt = Math.sin(Math.PI * frac);
  // golden hour tint near horizon
  const golden = isDay ? Math.max(0, 1 - alt * 2.2) : 0;
  const top = isDay ? mix(mix('#A9D3F5', '#5FA8E8', alt), '#F0B98A', golden * .5) : '#141235';
  const bottom = isDay ? mix(mix('#EAF3FA', '#D7ECFB', alt), '#FFD9A8', golden * .8) : '#2B2766';
  return { isDay, frac, alt, golden, top, bottom, h };
}

export function initScene(el, { onStatus } = {}) {
  if (!el) return;
  const W = 1600, H = 900;
  const stars = Array.from({ length: 70 }, (_, i) => {
    const x = (i * 197) % W, y = (i * 83) % 460, r = (i % 3) * .5 + .6;
    return `<circle class="star" cx="${x}" cy="${y}" r="${r}" fill="#fff" style="animation-delay:${(i % 7) * .6}s"/>`;
  }).join('');
  // Panel array in perspective (rows recede toward horizon).
  let panels = '';
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = lerp(560, 760, t), ph = lerp(46, 92, t), cols = Math.round(lerp(7, 5, t));
    const pw = lerp(78, 150, t), gap = lerp(6, 10, t);
    const total = cols * pw + (cols - 1) * gap;
    const x0 = lerp(1560, 1700, t) - total;
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (pw + gap), skew = pw * .18;
      panels += `<g><polygon points="${x + skew},${y} ${x + pw + skew},${y} ${x + pw},${y + ph} ${x},${y + ph}" fill="url(#cell)" stroke="var(--frame)" stroke-width="2"/>
        <polygon points="${x + skew},${y} ${x + pw + skew},${y} ${x + pw},${y + ph} ${x},${y + ph}" fill="url(#cells)" opacity=".55"/></g>`;
    }
    panels += `<rect x="${x0 - 20}" y="${y + ph}" width="${total + 60}" height="${lerp(4, 8, t)}" fill="var(--frame)" opacity=".7"/>`;
  }
  el.innerHTML = `
<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="${matchMedia('(max-width: 760px)').matches ? 'xMaxYMax' : 'xMidYMax'} slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sky-top"/><stop offset="1" class="sky-bottom"/></linearGradient>
    <radialGradient id="sunGlow"><stop offset="0" stop-color="#FFF6D6" stop-opacity=".95"/><stop offset=".35" stop-color="#FFE08A" stop-opacity=".45"/><stop offset="1" stop-color="#FFD166" stop-opacity="0"/></radialGradient>
    <radialGradient id="moonGlow"><stop offset="0" stop-color="#E9E6FF" stop-opacity=".5"/><stop offset="1" stop-color="#E9E6FF" stop-opacity="0"/></radialGradient>
    <linearGradient id="cell" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="cell-a"/><stop offset="1" class="cell-b"/></linearGradient>
    <pattern id="cells" width="14" height="10" patternUnits="userSpaceOnUse"><path d="M14 0H0V10" fill="none" stroke="rgba(255,255,255,.35)" stroke-width=".8"/></pattern>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ground-a"/><stop offset="1" class="ground-b"/></linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="fade-a"/><stop offset=".62" class="fade-b"/></linearGradient>
    <clipPath id="panelClip"><rect x="840" y="540" width="760" height="320"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <g class="night-only">${stars}</g>
  <g class="moon"><circle r="120" fill="url(#moonGlow)"/><circle r="30" fill="#F1EFFF"/><circle r="30" cx="12" cy="-8" fill="#1A1844" opacity=".9"/></g>
  <g class="sun"><circle class="sun-glow" r="190" fill="url(#sunGlow)"/><circle r="46" fill="#FFF3C4"/></g>
  <path d="M0 610 C 260 560, 420 600, 640 575 S 1100 540, 1600 590 L1600 900 L0 900Z" class="hills-far"/>
  <path d="M0 690 C 300 650, 520 700, 820 660 S 1280 640, 1600 670 L1600 900 L0 900Z" fill="url(#ground)"/>
  <g class="home" transform="translate(1150 432) scale(.92)">
    <path d="M0 60 L70 8 L140 60 V140 H0Z" class="house"/><rect x="52" y="88" width="36" height="52" class="door"/>
    <rect x="16" y="76" width="26" height="22" class="win"/><rect x="98" y="76" width="26" height="22" class="win"/>
    <g transform="translate(160 84)"><rect width="34" height="56" rx="6" class="battery"/><rect x="11" y="-6" width="12" height="6" rx="2" class="battery"/>
      <rect class="battery-fill" x="5" y="5" width="24" height="46" rx="3"/><circle class="battery-led" cx="17" cy="-14" r="4" fill="#88D23F"/></g>
  </g>
  <path class="flow-line" d="M1480 575 C 1450 530, 1420 540, 1378 548" fill="none" stroke="#88D23F" stroke-width="4" stroke-linecap="round"/>
  <path class="flow-line flow-batt" d="M1310 540 C 1300 520, 1290 525, 1280 530" fill="none" stroke="#88D23F" stroke-width="4" stroke-linecap="round"/>
  <g style="--frame: var(--panel-frame)">${panels}</g>
  <g clip-path="url(#panelClip)" class="day-only"><rect class="panel-sheen" x="840" y="540" width="260" height="320" fill="url(#sheen)" transform="skewX(-18)"/></g>
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
</svg>`;
  const svg = el.querySelector('svg');
  const q = (s) => svg.querySelector(s);
  const style = (sel, prop, v) => svg.querySelectorAll(sel).forEach((n) => n.setAttribute(prop, v));

  function paint() {
    const forced = document.documentElement.getAttribute('data-theme-mode');
    const theme = document.documentElement.getAttribute('data-theme');
    const { h, label } = lagosNow();
    const s = skyFor(h, forced === 'auto' ? null : theme);
    style('.sky-top', 'stop-color', s.top);
    style('.sky-bottom', 'stop-color', s.bottom);
    // sun arc: from left horizon to right horizon
    const sx = lerp(80, 1520, s.frac), sy = lerp(640, 120, s.alt);
    q('.sun').setAttribute('transform', `translate(${sx} ${sy})`);
    q('.sun').style.opacity = s.isDay ? 1 : 0;
    const mh = s.isDay ? 0 : ((h - SUNSET + 24) % 24) / (24 - (SUNSET - SUNRISE));
    q('.moon').setAttribute('transform', `translate(${lerp(1400, 260, mh)} ${lerp(560, 150, Math.sin(Math.PI * mh))})`);
    q('.moon').style.opacity = s.isDay ? 0 : 1;
    q('.night-only').style.opacity = s.isDay ? 0 : 1;
    q('.day-only').style.opacity = s.isDay ? 1 : 0;
    const day = s.isDay;
    style('.cell-a', 'stop-color', day ? mix('#22305E', '#4F6FA8', s.alt) : '#16174A');
    style('.cell-b', 'stop-color', day ? mix('#101A3A', '#1F3366', s.alt) : '#0B0C2C');
    svg.style.setProperty('--panel-frame', day ? '#C9D3DA' : '#3B3A6E');
    style('.ground-a', 'stop-color', day ? '#7DA35A' : '#1B2F17');
    style('.ground-b', 'stop-color', day ? '#4F7A33' : '#0E1A0C');
    svg.querySelector('.hills-far').setAttribute('fill', day ? '#9DBB7E' : '#1E2A33');
    svg.querySelector('.house').setAttribute('fill', day ? '#F6F3EC' : '#2D2B5C');
    svg.querySelector('.door').setAttribute('fill', day ? '#282358' : '#15133A');
    style('.win', 'fill', day ? '#9FC7E8' : '#FFD98A');
    style('.battery', 'fill', day ? '#FFFFFF' : '#2D2B5C');
    const fill = q('.battery-fill');
    fill.setAttribute('fill', '#88D23F');
    const charge = day ? Math.min(1, .45 + s.frac * .55) : Math.max(.25, 1 - mh * .7);
    fill.setAttribute('height', String(46 * charge)); fill.setAttribute('y', String(5 + 46 * (1 - charge)));
    // energy flow direction
    q('.flow-line').style.opacity = day && s.alt > .08 ? 1 : 0;
    q('.flow-batt').classList.toggle('reverse', !day);
    // readable left side
    const isNightUi = theme === 'night';
    style('.fade-a', 'stop-color', isNightUi ? 'rgba(18,16,46,.88)' : 'rgba(242,245,239,.92)');
    style('.fade-b', 'stop-color', isNightUi ? 'rgba(18,16,46,0)' : 'rgba(242,245,239,0)');
    if (onStatus) {
      const pct = Math.round(s.alt * 100);
      onStatus({ isDay: day, label, pct, charge: Math.round(charge * 100), simulated: forced !== 'auto' && forced });
    }
  }
  paint();
  const timer = setInterval(paint, 60000);
  window.addEventListener('vs:theme', paint);
  return () => clearInterval(timer);
}
