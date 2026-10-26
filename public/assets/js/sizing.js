// Solar sizing shared by the home page estimator and the packages calculator.
// [key, name, watts, default hours/day, duty factor, icon, has a motor (start surge)]
export const APPLIANCES = [
  ['led', 'LED bulb', 10, 6, 1, 'ri-lightbulb-line'], ['fan', 'Standing / ceiling fan', 70, 8, 1, 'ri-windy-line'],
  ['tv', 'TV (32–55")', 100, 5, 1, 'ri-tv-2-line'], ['decoder', 'Decoder / sound bar', 25, 5, 1, 'ri-router-line'],
  ['fridge', 'Fridge', 150, 24, .4, 'ri-fridge-line', true], ['freezer', 'Deep freezer', 200, 24, .5, 'ri-fridge-fill', true],
  ['laptop', 'Laptop', 65, 6, 1, 'ri-macbook-line'], ['desktop', 'Desktop computer', 200, 8, 1, 'ri-computer-line'],
  ['phone', 'Phone charging', 10, 3, 1, 'ri-smartphone-line'], ['wifi', 'Wi-Fi router', 15, 24, 1, 'ri-wifi-line'],
  ['cctv', 'CCTV system', 40, 24, 1, 'ri-camera-line'], ['printer', 'Printer', 50, 2, 1, 'ri-printer-line'],
  ['ac1', 'Inverter AC 1HP', 900, 6, .7, 'ri-temp-cold-line', true], ['ac15', 'Inverter AC 1.5HP', 1300, 6, .7, 'ri-temp-cold-line', true],
  ['ac2', 'AC 2HP', 1800, 6, .75, 'ri-temp-cold-line', true], ['pump', 'Pumping machine (1HP)', 750, .5, 1, 'ri-drop-line', true],
  ['iron', 'Pressing iron', 1000, .5, .6, 'ri-t-shirt-line'], ['microwave', 'Microwave', 1200, .3, 1, 'ri-fire-line'],
  ['washer', 'Washing machine', 500, 1, .7, 'ri-t-shirt-air-line', true], ['gate', 'Gate motor', 300, .3, 1, 'ri-door-line', true],
];
export const INVERTERS = [1, 1.5, 2.5, 3.5, 4.2, 5, 7.5, 10, 15, 20, 30];
export const PANEL_W = 550, SUN_HOURS = 4.5, SYS_EFF = .8, KWH_PER_LITRE = 1.6;
export const appliance = (k) => APPLIANCES.find((x) => x[0] === k);

// rows: [{ k, q, h }]  →  sizes for inverter, battery and panels
export function size(rows, { lithium = true, night = .6 } = {}) {
  let load = 0, daily = 0, motor = 0;
  rows.forEach((r) => {
    // Custom appliances typed in by the visitor carry their own watts (and hours).
    const a = r.w ? [r.k, r.name || 'Appliance', r.w, r.h ?? 4, 1, 'ri-plug-line', r.w >= 500] : appliance(r.k);
    if (!a || !r.q) return;
    load += a[2] * r.q;
    daily += a[2] * r.q * Math.min(24, r.h ?? a[3]) * a[4];
    if (a[6]) motor = Math.max(motor, a[2]);
  });
  const dailyKwh = daily / 1000;
  const peakW = load * .75 + motor * 1.5; // diversity + motor start surge
  const kva = peakW / .8 / 1000 * 1.2;
  const inverter = load ? (INVERTERS.find((x) => x >= kva) || Math.ceil(kva)) : 0;
  const battery = (dailyKwh * night) / (lithium ? .85 : .5);
  const panels = load ? Math.max(1, Math.ceil((dailyKwh / SUN_HOURS / SYS_EFF) * 1000 / PANEL_W)) : 0;
  return { load, dailyKwh, inverter, battery, panels, kwp: panels * PANEL_W / 1000, lithium, night };
}

// Smallest standard package that covers the sized system, or null for a custom design.
export function recommend(packages, s) {
  if (!s.load) return null;
  return [...(packages || [])].sort((a, b) => a.inverter_kva - b.inverter_kva).find((p) =>
    p.inverter_kva >= s.inverter && p.pv_wp / 1000 * SUN_HOURS * SYS_EFF >= s.dailyKwh * .85 && p.battery_kwh * (s.lithium ? .85 : .5) >= s.dailyKwh * s.night * .8) || null;
}

export const packagePrice = (p, lithium) => (p ? (lithium ? p.price_lithium || p.price_lead_acid : p.price_lead_acid || p.price_lithium) : 0);
// Rough monthly generator fuel cost for the same energy.
export const fuelMonthly = (dailyKwh, pricePerLitre) => (dailyKwh / KWH_PER_LITRE) * pricePerLitre * 30;
