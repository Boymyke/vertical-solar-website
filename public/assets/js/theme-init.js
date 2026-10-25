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
  var lang = get('vs-lang');
  if (lang) d.setAttribute('lang', lang);
  var a = get('vs-a11y');
  if (a) { try { JSON.parse(a).forEach(function (c) { d.classList.add(c); }); } catch (e) {} }
})();
