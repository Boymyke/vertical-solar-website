// Runs before paint: day/night theme from Lagos local time (or the visitor's choice), language and accessibility preferences.
(function () {
  var d = document.documentElement, ls = {};
  try { ls = window.localStorage; } catch (e) {}
  function get(k) { try { return ls.getItem(k); } catch (e) { return null; } }
  function lagosHour() {
    var n = new Date(); return (n.getUTCHours() + 1 + n.getUTCMinutes() / 60) % 24;
  }
  var mode = get('vs-theme') || 'auto';
  var h = lagosHour();
  var theme = mode === 'auto' ? (h >= 6.6 && h < 18.75 ? 'day' : 'night') : mode;
  d.setAttribute('data-theme', theme);
  d.setAttribute('data-theme-mode', mode);
  // Shop links stay hidden until we know the shop is switched on (remembered from the last visit), so they never flash.
  // A private shop link (/shop?key=…) is remembered in a cookie so product pages and checkout keep working.
  var m = /[?&]key=([A-Za-z0-9]{6,40})/.exec(location.search);
  if (m && /^\/(shop|checkout)/.test(location.pathname)) document.cookie = 'vs_shop=' + m[1] + '; path=/; max-age=2592000; samesite=lax' + (location.protocol === 'https:' ? '; secure' : '');
  var priv = /(?:^|;\s*)vs_shop=/.test(document.cookie);
  d.setAttribute('data-shop', get('vs-shop') === 'on' ? 'on' : priv ? 'private' : 'off');
  var lang = get('vs-lang');
  if (lang) d.setAttribute('lang', lang);
  // Another language: keep the page under a short loading veil until the translation is applied (max 3s).
  if (lang && lang !== 'en' && /^(ig|ha|yo|pcm)$/.test(lang)) { d.classList.add('i18n-wait'); setTimeout(function () { d.classList.remove('i18n-wait'); }, 3000); }
  var a = get('vs-a11y');
  if (a) { try { JSON.parse(a).forEach(function (c) { d.classList.add(c); }); } catch (e) {} }
})();
