// Contact page: branch cards + Leaflet map (OpenStreetMap tiles).
import { $ } from '../core.js';
import { fillBlocks } from '../render.js';
export default async function (site) {
  await fillBlocks(site);
  const el = $('[data-map]');
  if (!el || !window.L || !site?.branches?.length) { if (el) el.hidden = true; return; }
  const map = L.map(el, { scrollWheelZoom: false }).setView([8.4, 6.2], 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  L.Icon.Default.imagePath = '/assets/vendor/leaflet/images/';
  const pts = [];
  site.branches.filter((b) => b.lat).forEach((b) => {
    const m = L.marker([b.lat, b.lng], { title: b.name }).addTo(map);
    m.bindPopup(`<strong>${b.name}</strong><br>${b.address || ''}<br>${(b.phones || []).join(', ')}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}" target="_blank" rel="noopener">Directions</a>`);
    pts.push([b.lat, b.lng]);
  });
  if (pts.length) map.fitBounds(pts, { padding: [40, 40] });
  if (location.hash.startsWith('#branch-')) document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' });
}
