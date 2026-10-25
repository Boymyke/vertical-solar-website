// Generates migrations/0002_seed.sql — starting content for the website & CRM.
import fs from 'node:fs';
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const ins = (table, rows) => rows.map((r) => `INSERT INTO ${table} (${Object.keys(r).join(',')}) VALUES (${Object.values(r).map(q).join(',')});`).join('\n');
const J = (o) => JSON.stringify(o);

const branches = [
  { name: 'Lagos — Head Office', state: 'Lagos', address: '5 Agbonyin Street, Off Nnobi Street, By Adelabu, Surulere, Lagos', phones: J(['08186311330', '07036234843']), email: 'Verticalenergy.ng@gmail.com', hours: 'Mon–Fri 8am–6pm, Sat 9am–3pm', lat: 6.4969, lng: 3.354, is_hq: 1, sort: 1 },
  { name: 'Abuja', state: 'FCT', address: 'Suite 65, Nandu Plaza, Ndola Crescent, Wuse Zone 5 (by MTN office), Abuja', phones: J(['08051523585']), hours: 'Mon–Fri 8am–6pm, Sat 9am–3pm', lat: 9.0632, lng: 7.4673, is_hq: 0, sort: 2 },
  { name: 'Port Harcourt', state: 'Rivers', address: 'Gatehouse 2, Shop 5, BlueSteel Boulevard, Aba Road, Port Harcourt', phones: J(['07036234843']), hours: 'Mon–Fri 8am–6pm, Sat 9am–3pm', lat: 4.8243, lng: 7.0336, is_hq: 0, sort: 3 },
  { name: 'Kano', state: 'Kano', address: 'No. 1 Nassarawa Hospital Road, Off Audu Bako Way, Kano', phones: J(['09164023564']), hours: 'Mon–Fri 8am–6pm, Sat 9am–3pm', lat: 11.9888, lng: 8.5311, is_hq: 0, sort: 4 },
  { name: 'Benin City', state: 'Edo', address: '28 Country Home Road, Oredo, Sapele Road by Ikpopan Junction, Benin City', phones: J(['09035587024', '08161701105']), hours: 'Mon–Fri 8am–6pm, Sat 9am–3pm', lat: 6.3176, lng: 5.6145, is_hq: 0, sort: 5 },
];

const socials = [
  { platform: 'Facebook', icon: 'ri-facebook-circle-fill', url: 'https://www.facebook.com/share/1PF9JWuVoi/', sort: 1 },
  { platform: 'Instagram', icon: 'ri-instagram-line', url: 'https://www.instagram.com/verticalsolarnigeria/', sort: 2 },
  { platform: 'LinkedIn', icon: 'ri-linkedin-box-fill', url: 'https://www.linkedin.com/company/vertical-solar/', sort: 3 },
  { platform: 'TikTok', icon: 'ri-tiktok-fill', url: 'https://www.tiktok.com/@verticalsolar', sort: 4 },
];

const packages = [
  { name: 'Economy', tier: 'residential', tagline: 'Entry-level home backup', inverter_kva: 1, pv_wp: 620, battery_kwh: 2.4, loads: '5 bulbs, 2 fans, 1 TV (43")', price_lead_acid: 1164500, price_lithium: null, featured: 0, sort: 1 },
  { name: 'Premium', tier: 'residential', tagline: 'Balanced home energy system', inverter_kva: 2.5, pv_wp: 1600, battery_kwh: 5, loads: '10 bulbs, 3 fans, 1 TV, 1 fridge', price_lead_acid: 2132000, price_lithium: 2447000, featured: 0, sort: 2 },
  { name: 'Silver', tier: 'residential', tagline: 'Whole-home comfort', inverter_kva: 4.2, pv_wp: 2400, battery_kwh: 10, loads: '20 bulbs, 3 fans, 2 TVs, freezer, laptop', price_lead_acid: 2501000, price_lithium: 2810000, featured: 1, sort: 3 },
  { name: 'Gold', tier: 'commercial', tagline: 'Commercial-grade system', inverter_kva: 5, pv_wp: 5300, battery_kwh: 15, loads: 'Office equipment, water pump and appliances', price_lead_acid: 3985000, price_lithium: 4540000, featured: 0, sort: 4 },
  { name: 'Ruby', tier: 'commercial', tagline: 'Large commercial system', inverter_kva: 7.5, pv_wp: 8480, battery_kwh: 30, loads: 'Multiple ACs, office and refrigeration', price_lead_acid: 7739000, price_lithium: 8349000, featured: 1, sort: 5 },
  { name: 'Diamond', tier: 'commercial', tagline: 'Industrial-grade powerhouse', inverter_kva: 10, pv_wp: 11660, battery_kwh: 35, loads: 'Full building and heavy appliances', price_lead_acid: 10523000, price_lithium: 10788000, featured: 0, sort: 6 },
];

const projects = [
  { slug: 'mm2-plaza-benin-city', title: 'MM2 Plaza — MM2 Enterprise', client: 'MM2 Enterprise', location: 'Benin City, Edo', category: 'commercial',
    summary: 'Grid-tied hybrid solar PV system with integrated battery storage for reliable supply, optimised load management and peak shaving across a busy commercial plaza.',
    body: '<h2>The challenge</h2><p>A multi-tenant plaza with shops and offices was paying heavily for diesel to cover frequent grid outages, and voltage swings were damaging tenants’ equipment.</p><h2>What we built</h2><p>We designed a hybrid plant that runs the plaza on solar during the day, charges a 107.5 kWh battery bank, and draws on the grid only when needed. The system manages loads automatically and shaves the evening peak.</p><ul><li>62 kWp rooftop PV array on the existing metal roof</li><li>100 kW hybrid inverter capacity</li><li>107.5 kWh battery storage</li><li>Surge protection, earthing and labelled distribution for every tenant circuit</li></ul><h2>The result</h2><p>Stable power for tenants, far fewer generator hours, and a system the facility manager can monitor remotely.</p>',
    pv_kwp: 62, inverter_kw: 100, battery_kwh: 107.5, images: J(['/images/site/mm2-plaza-rooftop.webp', '/images/site/battery-room-lithium.webp']), featured: 1, sort: 1 },
  { slug: 'qoray-ev-charging-station-ilorin', title: 'QORAY Charging Station', client: 'QORAY', location: 'Ilorin, Kwara', category: 'industrial',
    summary: 'Hybrid solar PV installation with battery backup that keeps an electric-tricycle charging hub running all day with minimal generator use.',
    body: '<h2>The challenge</h2><p>An electric keke charging station needs dependable power from early morning to late night. Relying on the grid and diesel made charging unreliable and expensive.</p><h2>What we built</h2><p>A 120.5 kWp solar canopy that doubles as shade for parked vehicles, paired with 90 kW of inverter capacity and 150 kWh of battery storage.</p><ul><li>120.5 kWp solar canopy</li><li>90 kW hybrid inverters</li><li>150 kWh battery storage</li></ul><h2>The result</h2><p>Operational continuity for the fleet, lower energy cost per charge and a visible showcase of clean mobility in Ilorin.</p>',
    pv_kwp: 120.5, inverter_kw: 90, battery_kwh: 150, images: J(['/images/site/qoray-charging-station.webp', '/images/site/inverter-bank.webp']), featured: 1, sort: 2 },
  { slug: 'mainframes-international-home-of-drinks-benin', title: 'Mainframes International — Home of Drinks', client: 'Mainframes International', location: 'Benin City, Edo', category: 'commercial',
    summary: 'Grid-connected hybrid solar PV system with integrated storage designed for stable, uninterrupted supply to a busy drinks distribution business.',
    body: '<h2>The challenge</h2><p>Cold rooms, coolers and point-of-sale systems cannot afford outages. The business needed clean, stable power without the noise and fuel bills of a large generator.</p><h2>What we built</h2><p>A 49.6 kWp hybrid system with 40 kW inverter capacity and 30 kWh of lithium storage, configured to prioritise refrigeration loads.</p><h2>The result</h2><p>Uninterrupted supply for refrigeration and sales, and reduced reliance on diesel.</p>',
    pv_kwp: 49.6, inverter_kw: 40, battery_kwh: 30, images: J(['/images/site/mainframes-inverters.webp']), featured: 1, sort: 3 },
];

const faqs = [
  ['How much does a solar system cost in Nigeria?', 'Our complete installed packages start from about ₦1.16 million for a 1kVA starter system and go up to ₦10.8 million for a 10kVA system with 35 kWh of storage. The final price depends on your appliances, backup hours, battery type and roof. A free load audit gives you an exact written quote.', 'pricing'],
  ['Can solar power my air conditioner?', 'Yes. Inverter ACs are the easiest to run on solar. A 1.5HP inverter AC typically needs at least a 5kVA system with enough panels and storage for the hours you want it on. Tell us how many ACs and for how long, and we will size it properly.', 'sizing'],
  ['Lithium or lead-acid batteries — which should I choose?', 'Lead-acid (tubular) batteries cost less upfront. Lithium-ion (LiFePO4) batteries cost more but last several times longer, can be used more deeply, charge faster and need no topping up. Over the life of the system, lithium usually costs less per year of use.', 'batteries'],
  ['How long do solar panels and batteries last?', 'Quality solar panels typically carry 10–12 year product and 25–30 year performance warranties. Hybrid inverters usually carry 2–5 years. Lithium batteries commonly last 6,000 cycles or more; tubular lead-acid batteries around 1,500 cycles, depending on use and care.', 'general'],
  ['Will my system work during the rainy season or harmattan?', 'Yes. Panels still produce on cloudy days, just less. We size the array with Nigerian weather in mind, and your inverter can also charge from the grid or a generator when there is not enough sun. Wiping harmattan dust off the panels restores lost output.', 'general'],
  ['Do you offer installment payments?', 'Yes. Through our Power-as-a-Product (PaaP) plan you can pay a deposit and spread the balance over monthly payments. Customers who pay in full can qualify for a discount. See the financing page or ask us for terms.', 'financing'],
  ['How long does installation take?', 'Most home systems are installed in one to two days once equipment is on site. Commercial and industrial projects are scheduled after design approval and typically take one to four weeks depending on size.', 'installation'],
  ['Which areas do you cover?', 'We have branches in Lagos (head office, Surulere), Abuja, Port Harcourt, Kano and Benin City, and we install in surrounding states. Contact the nearest branch for a site visit.', 'general'],
  ['Can I add more panels or batteries later?', 'Usually, yes — if the inverter has spare capacity. We design systems with room to grow and will tell you the expansion limits in your quote.', 'sizing'],
  ['What maintenance does a solar system need?', 'Clean the panels every two to four weeks in dusty months, keep the inverter area ventilated, and book a professional check every six months. Lead-acid batteries need water level checks; lithium batteries do not. Our solar care guide explains everything.', 'maintenance'],
  ['My inverter is beeping. What should I do?', 'Note the error code or light on the screen, reduce the load by switching off heavy appliances, and check that the battery and breakers are on. If it continues, open a support ticket or call us — do not open the inverter or battery terminals yourself.', 'support'],
  ['Do you sell equipment without installation?', 'Yes, our online shop sells panels, inverters, batteries and accessories, and we can deliver. We strongly recommend professional installation to protect your warranty and your safety.', 'shop'],
  ['Is solar cheaper than running a generator?', 'For most homes and businesses that run a generator daily, yes. Solar has a higher upfront cost but almost no running cost, while fuel and servicing costs keep rising. Our load calculator compares your current spend with a solar system.', 'pricing'],
  ['Do I need permission to install solar on my roof?', 'For private homes, you generally do not need a permit for rooftop solar. For rented property, get written consent from the landlord. For estates and commercial buildings, we help you work with the facility manager.', 'installation'],
].map(([question, answer, category], i) => ({ question, answer, category, sort: i + 1 }));

const products = [
  ...packages.map((p) => ({ sku: `KIT-${p.name.toUpperCase()}`, name: `${p.name} Solar Kit — ${p.inverter_kva}kVA (installed)`, slug: `${p.name.toLowerCase()}-solar-kit-${String(p.inverter_kva).replace('.', '-')}kva`, category: 'kits', brand: 'Vertical Solar',
    description: `<p>Complete ${p.inverter_kva}kVA solar system with ${p.pv_wp.toLocaleString()}Wp of panels and ${p.battery_kwh} kWh of lead-acid battery storage. Runs: ${p.loads}.</p><p>Price includes delivery, mounting, cabling, protection devices, installation and commissioning within our branch cities. A free site survey confirms the final design.</p>`,
    specs: J({ Inverter: `${p.inverter_kva} kVA hybrid`, 'Solar panels': `${p.pv_wp.toLocaleString()} Wp`, 'Battery storage': `${p.battery_kwh} kWh`, 'Battery type': 'Lead-acid (lithium upgrade available)', 'Suitable for': p.loads }),
    price: p.price_lead_acid, cost: 0, stock: 0, reorder_level: 1, images: J(['/images/site/' + (p.tier === 'commercial' ? 'mm2-plaza-rooftop.webp' : 'battery-room-lithium.webp')]), in_shop: 1, featured: p.featured, warranty_months: 12 })),
  ...[
    ['PNL-550', 'Mono PERC solar panel 550W', 'panels'], ['PNL-450', 'Mono solar panel 450W', 'panels'], ['INV-5K48', 'Hybrid inverter 5kVA 48V', 'inverters'], ['INV-10K48', 'Hybrid inverter 10kVA 48V', 'inverters'],
    ['BAT-LFP5', 'Lithium (LiFePO4) battery 5kWh 51.2V', 'batteries'], ['BAT-LFP10', 'Lithium (LiFePO4) battery 10kWh 51.2V', 'batteries'], ['BAT-T220', 'Tubular battery 220Ah 12V', 'batteries'],
    ['CC-MPPT60', 'MPPT charge controller 60A', 'charge-controllers'], ['ACC-SPD', 'DC surge protection device', 'accessories'], ['ACC-ISO', 'DC isolator switch', 'accessories'],
    ['ACC-CBL6', 'Solar PV cable 6mm² (per metre)', 'accessories'], ['ACC-RAIL', 'Roof mounting rail kit (per panel)', 'accessories'],
  ].map(([sku, name, category]) => ({ sku, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, ''), category, price: 0, cost: 0, stock: 0, reorder_level: 5, in_shop: 0, images: '[]', specs: '{}', warranty_months: 12 })),
];

const today = new Date();
const daysAgo = (n) => new Date(today - n * 864e5).toISOString().replace('T', ' ').slice(0, 19);
const posts = [
  { slug: 'how-to-size-a-solar-system-for-your-home-in-nigeria', title: 'How to size a solar system for your home in Nigeria', category: 'guides', cover: '/images/site/battery-room-lithium.webp', published_at: daysAgo(40), read_minutes: 6,
    excerpt: 'A simple, step-by-step method to work out the inverter, battery and panel sizes your home actually needs — before you talk to any installer.',
    seo_description: 'Step-by-step guide to sizing a home solar system in Nigeria: list your appliances, calculate daily kWh, choose inverter kVA, battery capacity and number of panels.',
    body: `<p>The most common reason solar systems disappoint is simple: they were sized from a price, not from the home. Before you compare quotes, spend fifteen minutes with this method. You will know roughly what you need and be able to spot an under-sized offer.</p>
<h2>1. List what you want to run during an outage</h2><p>Walk through your home and write down each appliance, its wattage (on the label or manual) and how many hours a day you want it on. Be honest — the fridge runs all day, the pumping machine might run 30 minutes.</p>
<table><thead><tr><th>Appliance</th><th>Watts</th><th>Hours/day</th><th>Wh/day</th></tr></thead><tbody><tr><td>10 LED bulbs</td><td>100</td><td>6</td><td>600</td></tr><tr><td>3 standing fans</td><td>210</td><td>8</td><td>1,680</td></tr><tr><td>Fridge</td><td>150</td><td>10 (compressor time)</td><td>1,500</td></tr><tr><td>43" TV + decoder</td><td>120</td><td>5</td><td>600</td></tr><tr><td>Phones & laptops</td><td>100</td><td>4</td><td>400</td></tr><tr><td><strong>Total</strong></td><td><strong>680 W</strong></td><td></td><td><strong>4,780 Wh ≈ 4.8 kWh</strong></td></tr></tbody></table>
<h2>2. Choose the inverter size</h2><p>The inverter must handle everything that can be on at the same time, plus starting surges from motors (fridges, pumps, ACs). A good rule: add up running watts that overlap, multiply by 1.3, and convert to kVA (divide by about 0.8). For the example above, a 2.5–3.5kVA inverter is comfortable. Add an inverter AC and you are into 5kVA territory.</p>
<h2>3. Choose battery capacity for your backup hours</h2><p>Decide how much of your daily energy must come from the battery — usually the evening and night portion. If 3 kWh of the 4.8 kWh is used after sunset, you need 3 kWh of <em>usable</em> storage.</p><ul><li><strong>Lithium (LiFePO4):</strong> about 80–90% usable. 3 kWh ÷ 0.85 ≈ 3.5 kWh battery.</li><li><strong>Lead-acid / tubular:</strong> only about 50% usable for good life. 3 kWh ÷ 0.5 = 6 kWh battery.</li></ul>
<h2>4. Work out the number of panels</h2><p>Nigeria gets roughly 4–6 peak sun hours a day depending on location and season; we design with about 4.5. To replace 4.8 kWh a day with losses, you need about 4.8 ÷ 4.5 ÷ 0.8 ≈ 1.3 kWp of panels — three 450–550W panels. If you also want the battery full by evening on cloudy days, go bigger.</p>
<div class="callout"><strong>Shortcut:</strong> our <a href="/packages#calculator">load calculator</a> does this maths for you and recommends a package. A free site survey then checks your roof, wiring and shading.</div>
<h2>5. Check the things calculators miss</h2><ul><li>Roof direction and shading from trees, tanks or neighbouring buildings</li><li>Condition of your house wiring and earthing</li><li>Where the inverter and batteries will live — cool, ventilated, away from children</li><li>Whether you will run a generator or grid charging as backup</li></ul><p>Get those right and your system will run quietly for years. If you would like an engineer to do it with you, <a href="/get-quote">book a free load audit</a>.</p>` },
  { slug: 'lithium-vs-lead-acid-tubular-batteries-nigeria', title: 'Lithium vs lead-acid (tubular) batteries: which should you choose?', category: 'guides', cover: '/images/site/inverter-bank.webp', published_at: daysAgo(31), read_minutes: 5,
    excerpt: 'Tubular batteries are cheaper today. Lithium batteries are often cheaper over the life of your system. Here is how to decide.',
    seo_description: 'Compare lithium (LiFePO4) and tubular lead-acid inverter batteries in Nigeria: cost, lifespan, usable capacity, maintenance and which is best for your home or business.',
    body: `<p>The battery is the most expensive part of most backup systems, and the one people most often regret choosing. Here is a clear comparison of the two options we install.</p>
<h2>The short answer</h2><p>If you use your batteries every day — which most Nigerian homes do — <strong>lithium (LiFePO4) usually works out cheaper per year</strong>, even though it costs more upfront. If the system is mainly for occasional outages and the budget is tight, tubular lead-acid is a sensible start.</p>
<h2>Side by side</h2><table><thead><tr><th></th><th>Tubular lead-acid</th><th>Lithium (LiFePO4)</th></tr></thead><tbody>
<tr><td>Upfront cost</td><td>Lower</td><td>Higher</td></tr><tr><td>Usable capacity</td><td>About 50% for good life</td><td>About 80–90%</td></tr><tr><td>Typical cycle life</td><td>Around 1,200–1,500</td><td>Around 6,000+</td></tr><tr><td>Maintenance</td><td>Distilled water top-ups, terminal cleaning</td><td>None</td></tr><tr><td>Charging speed</td><td>Slower</td><td>Faster — fills on shorter sunny days</td></tr><tr><td>Weight and space</td><td>Heavy, needs ventilation</td><td>Compact, rack or wall-mounted</td></tr><tr><td>Monitoring</td><td>Basic</td><td>Built-in battery management system</td></tr></tbody></table>
<h2>Why usable capacity matters</h2><p>A 10 kWh lead-acid bank should only be discharged to about 5 kWh if you want it to last. A 10 kWh lithium battery gives you 8–9 kWh. So you often need a much larger lead-acid bank to get the same backup hours — which narrows the price gap.</p>
<h2>When lead-acid still makes sense</h2><ul><li>Very tight budgets where getting started matters most</li><li>Backup used only a few hours a week</li><li>Sites where you plan to upgrade the whole system within two to three years</li></ul>
<h2>Our recommendation</h2><p>Every package on our <a href="/packages">packages page</a> shows both prices so you can compare. If you are unsure, ask for both options in your quote and we will show you the cost per year of backup for each.</p>` },
  { slug: 'solar-vs-generator-cost-nigeria', title: 'Solar vs generator: how to compare the real cost for your home', category: 'finance', cover: '/images/site/team-installing-panels.webp', published_at: daysAgo(22), read_minutes: 5,
    excerpt: 'Fuel, servicing, repairs and noise add up. Use this simple worksheet with your own numbers to see when solar pays for itself.',
    seo_description: 'Compare the cost of running a petrol or diesel generator with a solar and battery system in Nigeria. A simple worksheet to calculate your payback period.',
    body: `<p>Prices for petrol and diesel change often, so instead of quoting numbers that will be out of date next month, this guide gives you a worksheet. Fill it in with your own receipts.</p>
<h2>Step 1: What does your generator really cost per month?</h2><ul><li><strong>Fuel:</strong> litres per day × price per litre × days you run it</li><li><strong>Servicing:</strong> oil changes, plugs and filters per month</li><li><strong>Repairs:</strong> average yearly repair bill ÷ 12</li><li><strong>Replacement:</strong> generator price ÷ months it usually lasts</li></ul><p>Add these up. Many households are surprised that the total is two to three times the fuel bill they remember.</p>
<h2>Step 2: What does solar cost?</h2><p>Take the installed price of a system that covers the same loads (see <a href="/packages">our packages</a>), and add a small yearly maintenance allowance. Solar has almost no running cost: no fuel, no oil, no daily start-up.</p>
<h2>Step 3: Work out payback</h2><p><strong>Payback (months) = solar system price ÷ monthly generator cost.</strong> After that point, the power is close to free for the remaining life of the panels and battery.</p>
<div class="callout">Our <a href="/packages#calculator">load calculator</a> includes a monthly cost comparison. Enter what you spend on fuel today to see your estimated savings.</div>
<h2>The costs that are harder to price</h2><ul><li>No noise at night and no fumes indoors</li><li>No queuing for fuel during scarcity</li><li>Stable voltage that protects your appliances</li><li>Power stays on when you travel — no one needs to start the generator</li></ul>
<h2>What about pay-monthly?</h2><p>If paying upfront is the obstacle, our <a href="/financing">Power-as-a-Product plan</a> lets you pay a deposit and spread the balance. Many customers find the monthly payment is close to what they were spending on fuel.</p>` },
  { slug: 'solar-panel-care-harmattan-rainy-season', title: 'How to care for your solar panels in harmattan and rainy season', category: 'solar-care', cover: '/images/site/mm2-plaza-rooftop.webp', published_at: daysAgo(14), read_minutes: 4,
    excerpt: 'Harmattan dust can cut output noticeably. Here is a safe cleaning routine and what to check before the rains.',
    seo_description: 'Solar panel cleaning and maintenance tips for Nigeria: how to clean dust during harmattan, what to check in the rainy season, and when to call a technician.',
    body: `<p>Solar panels have no moving parts, but Nigerian weather still asks a little of you. Two seasons matter most.</p>
<h2>Harmattan (roughly November to March)</h2><p>Fine dust settles on panels and blocks sunlight. A dusty array can produce noticeably less, which means flatter batteries in the evening.</p><h3>Safe cleaning routine</h3><ol><li>Clean early in the morning or late afternoon when the glass is cool — never cold water on hot glass.</li><li>Use clean water and a soft brush or sponge on a pole. Mild soap only if needed.</li><li>Do not use detergents, abrasive pads or pressure washers.</li><li>Do not stand or lean on panels.</li><li>If panels are on a high or steep roof, call us — do not climb.</li></ol><p>During heavy harmattan, cleaning every two weeks is reasonable. Watch your inverter's PV reading: if midday output drops, it is time.</p>
<h2>Rainy season (roughly April to October)</h2><ul><li>Rain cleans panels for you, but check for leaves and bird droppings that rain does not shift.</li><li>Look for loose cables, damaged conduit or water near the inverter and battery area.</li><li>Make sure surge protection is in place — lightning-season surges are a common cause of inverter damage.</li><li>Expect lower output on overcast days; set the inverter to grid or generator charging if needed.</li></ul>
<h2>Every six months</h2><p>Book a professional check: torque on terminals, insulation tests, inverter firmware and battery health. Customers on our maintenance plan get a reminder automatically. See the full <a href="/solar-care">solar care guide</a>.</p>` },
  { slug: 'inverter-beeping-error-lights-what-they-mean', title: 'Inverter beeping? What the alarms and error lights usually mean', category: 'solar-care', cover: '/images/site/mainframes-inverters.webp', published_at: daysAgo(8), read_minutes: 4,
    excerpt: 'Most inverter alarms point to a handful of causes: overload, low battery, high temperature or a grid problem. Here is what to do safely.',
    seo_description: 'Why is my inverter beeping? Common inverter alarms in Nigeria explained — overload, low battery, over-temperature and grid faults — and safe steps to take.',
    body: `<p>Every inverter brand has its own codes, so always check your manual or the screen message. But most alarms come down to a few causes.</p>
<h2>Overload</h2><p><strong>Sign:</strong> continuous beeping when a heavy appliance starts (pump, iron, microwave, AC). <strong>Do:</strong> switch off the heavy load, wait for the alarm to clear, and avoid running large appliances together.</p>
<h2>Low battery</h2><p><strong>Sign:</strong> intermittent beeping at night, battery percentage low. <strong>Do:</strong> reduce loads to essentials. If it happens every night, your battery may be too small, ageing, or your panels may need cleaning.</p>
<h2>Over-temperature</h2><p><strong>Sign:</strong> fan running loudly, temperature warning. <strong>Do:</strong> clear anything blocking the vents and improve airflow. Inverters should never be in a closed cupboard or direct sun.</p>
<h2>Grid or input fault</h2><p><strong>Sign:</strong> warning when public power returns or fluctuates. <strong>Do:</strong> usually nothing — the inverter is protecting your home from bad supply. If it repeats often, we can adjust input settings.</p>
<h2>When to stop and call us</h2><ul><li>Burning smell, smoke, or swollen batteries</li><li>Water near the inverter or batteries</li><li>Breakers that trip again immediately after resetting</li></ul><div class="callout"><strong>Safety first:</strong> switch off the inverter and the battery breaker, keep people away, and <a href="/support">open a support ticket</a> or call us. Never open the inverter or touch battery terminals.</div>` },
  { slug: 'case-study-62kwp-hybrid-solar-mm2-plaza-benin', title: 'Case study: a 62 kWp hybrid solar plant for MM2 Plaza, Benin City', category: 'case-studies', cover: '/images/site/mm2-plaza-rooftop.webp', published_at: daysAgo(3), read_minutes: 3,
    excerpt: 'How we designed a hybrid system with 107.5 kWh of storage to keep a multi-tenant plaza running and shave its evening peak.',
    seo_description: 'Case study: Vertical Solar designed and installed a 62 kWp hybrid solar PV system with 100 kW inverters and 107.5 kWh battery storage at MM2 Plaza, Benin City.',
    body: `<p>MM2 Plaza is a busy commercial building in Benin City with shops and offices. Frequent outages meant long generator hours, and voltage swings were damaging tenants' equipment.</p>
<h2>System at a glance</h2><ul><li><strong>Solar PV:</strong> 62 kWp rooftop array</li><li><strong>Inverters:</strong> 100 kW hybrid capacity</li><li><strong>Storage:</strong> 107.5 kWh battery bank</li><li><strong>Mode:</strong> grid-tied hybrid with load management and peak shaving</li></ul>
<h2>Design choices</h2><p>We mapped every tenant circuit, separated essential from non-essential loads, and sized storage to carry the plaza through the evening peak. Surge protection and proper earthing were added throughout, and the distribution boards were relabelled so the facility team can isolate any tenant safely.</p>
<h2>Outcome</h2><p>The plaza now runs primarily on solar during the day, uses stored energy in the evening, and needs the generator far less. See photos on the <a href="/projects/mm2-plaza-benin-city">project page</a>, or <a href="/get-quote">ask us about your building</a>.</p>` },
].map((p) => ({ ...p, status: 'published', author_name: 'Vertical Solar Engineering Team', tags: '[]', seo_title: null }));

const popups = [{ title: 'Buy now, pay later on a 3.5kVA system', body: 'Pay in full and get 5% off any purchase, or spread the cost. Every purchase includes installation and one year of maintenance.', image: '/images/site/promo-buy-now-pay-later.webp',
  cta_text: 'Claim the offer', cta_url: '/get-quote?package=3.5kVA%20promo', style: 'corner', pages: '/,/packages,/financing', trigger: 'delay', delay_seconds: 14, frequency: 'session', active: 1 }];

const settings = [];

const sql = `-- Seed content (generated by scripts/seed.mjs)
${ins('branches', branches)}
${ins('socials', socials)}
${ins('packages', packages)}
${ins('projects', projects)}
${ins('faqs', faqs)}
${ins('products', products)}
${ins('posts', posts)}
${ins('popups', popups)}
${settings.join('\n')}
`;
fs.writeFileSync(new URL('../migrations/0002_seed.sql', import.meta.url), sql);
console.log('seed written', sql.length, 'bytes');
