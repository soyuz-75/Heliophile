/* Heliophile — site behaviour
   Ports the runtime logic from the Claude Design prototype's DCLogic component:
   language switch, animated "flux" grid, the peak-shaving chart, and accent contrast. */
(function () {
  'use strict';

  /* ---------- Language toggle ---------- */
  var btnFr = document.getElementById('btnFr');
  var btnEn = document.getElementById('btnEn');

  function setLang(lang) {
    var fr = lang === 'fr';
    document.body.classList.toggle('lang-fr', fr);
    document.body.classList.toggle('lang-en', !fr);
    document.documentElement.lang = lang;
    btnFr.setAttribute('aria-pressed', String(fr));
    btnEn.setAttribute('aria-pressed', String(!fr));
    try { localStorage.setItem('heliophile-lang', lang); } catch (e) {}
    // let other modules (e.g. the BESS sim selectors) relabel themselves
    document.dispatchEvent(new CustomEvent('heliophile:lang', { detail: { lang: lang } }));
  }

  btnFr.addEventListener('click', function () { setLang('fr'); });
  btnEn.addEventListener('click', function () { setLang('en'); });

  var saved = null;
  try { saved = localStorage.getItem('heliophile-lang'); } catch (e) {}
  setLang(saved === 'en' ? 'en' : 'fr');

  /* ---------- Accent contrast text ---------- */
  function accentTextColor() {
    var accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#E2930E';
    var hx = accent.replace('#', '');
    if (hx.length === 3) hx = hx.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(hx.slice(0, 2), 16) / 255,
        g = parseInt(hx.slice(2, 4), 16) / 255,
        b = parseInt(hx.slice(4, 6), 16) / 255;
    var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    document.documentElement.style.setProperty('--accent-text', lum > 0.5 ? '#171D1A' : '#FFFFFF');
  }
  accentTextColor();

  /* ---------- Hero "flux" grid ---------- */
  var fluxGrid = document.getElementById('fluxGrid');
  if (fluxGrid) {
    var lit = [2, 5, 9, 12, 16, 19, 23, 25, 30, 33];
    for (var i = 0; i < 35; i++) {
      var cell = document.createElement('div');
      cell.className = 'flux__cell';
      if (lit.indexOf(i) !== -1) {
        cell.classList.add('is-lit');
        cell.style.animation = 'hcell ' + (2.4 + (i % 5) * 0.5) + 's ease-in-out ' + ((i % 7) * 0.3) + 's infinite';
      }
      fluxGrid.appendChild(cell);
    }
  }

  /* ---------- Mobile menu ---------- */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('#navLinks a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }
})();

/* Heliophile — BESS live comparison simulation
   Drives the animated "without vs with battery" panels: one loop = one business day.
   Pure SVG + rAF, ~60fps, respects prefers-reduced-motion, pauses when off-screen.
   The whole day is now recomputed from a visitor-selected company profile
   (subscribed power OR monthly electricity bill). */
(function () {
  'use strict';
  var sim = document.getElementById('bessSim');
  if (!sim) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============================================================
     TUNABLE ESTIMATION CONSTANTS  — adjust these to recalibrate.
     ============================================================ */
  var EST = {
    BLENDED_PRICE:   0.18,   // €/kWh — blended all-in electricity price
    FULL_LOAD_HOURS: 3000,   // h/year — annual kWh ≈ peak_kW × this
    BATT_POWER_FRAC: 0.25,   // recommended battery power ≈ 25% of peak_kW
    BATT_DURATION_H: 2,      // battery energy_kWh ≈ power_kW × this (2-hour battery)
    CAPEX_PER_KWH:   500,    // €/kWh installed
    CO2_PER_KWH:     0.25,   // kg CO₂ avoided per kWh shifted (indicative)
    SAVINGS_MIN:     0.09,   // annual savings as share of annual bill — small sites
    SAVINGS_MAX:     0.14    // …large sites (keeps result in a credible 8–15% band)
  };

  /* ---------- day profiles (hour of day → value) ---------- */
  function sstep(a, b, t) { t = t < 0 ? 0 : t > 1 ? 1 : t; t = t * t * (3 - 2 * t); return a + (b - a) * t; }
  function sample(pts, h) {
    var n = pts.length;
    if (h <= pts[0][0]) return pts[0][1];
    if (h >= pts[n - 1][0]) return pts[n - 1][1];
    for (var i = 0; i < n - 1; i++) {
      if (h >= pts[i][0] && h <= pts[i + 1][0]) {
        return sstep(pts[i][1], pts[i + 1][1], (h - pts[i][0]) / (pts[i + 1][0] - pts[i][0]));
      }
    }
    return pts[n - 1][1];
  }

  // Base shapes are normalised around a ~842 kW peak reference site; the profile
  // selector rescales every kW / € value from these fixed curves.
  var LOAD  = [[6,150],[7.5,240],[9,360],[11,430],[12.5,455],[14,510],[15.5,610],[16.4,700],[17,780],[17.5,842],[18.5,770],[19.5,630],[21,470],[22.5,330],[24,250],[26,190],[28,155],[30,150]];
  var BATT  = [[15.8,0],[16.4,214],[17,300],[17.5,356],[18.5,300],[19.5,250],[20.5,160],[21.5,70],[22,0]];
  var SOCP  = [[6,100],[10,90],[12,88],[15,96],[16,95],[17.5,70],[19,52],[21,40],[22,38],[24,52],[27,80],[30,100]];
  var PRICE = [[6,0.10],[8,0.12],[10,0.14],[12,0.16],[14,0.19],[16,0.25],[17,0.31],[18,0.34],[19,0.33],[20,0.27],[21,0.20],[22,0.15],[24,0.11],[30,0.09]];

  function load(h)  { return sample(LOAD, h); }
  function battOut(h) { return (h < 15.8 || h > 22) ? 0 : Math.max(0, sample(BATT, h)); }
  function grid(h)  { return Math.max(0, load(h) - battOut(h)); }
  function socV(h)  { return sample(SOCP, h); }
  function priceV(h){ return sample(PRICE, h); }

  var BASE_PEAK = 0; for (var bi = 0; bi < LOAD.length; bi++) BASE_PEAK = Math.max(BASE_PEAK, LOAD[bi][1]); // = 842

  var H0 = 6, H1 = 30, PMIN = 0.09, PMAX = 0.35;

  /* ---------- precompute normalised cumulative shapes + running peaks ---------- */
  var N = 240, dh = (H1 - H0) / N, dt = 24 / N;
  var cumWO = [0], cumW = [0], cumCO2 = [0], pkWOa = [0], pkWa = [0];
  var eWO = 0, eW = 0, eco = 0, pkWO = 0, pkW = 0;
  for (var i = 1; i <= N; i++) {
    var h = H0 + i * dh, hm = H0 + (i - 0.5) * dh, p = priceV(hm);
    eWO += load(hm) * p * dt;
    eW  += grid(hm) * p * dt;
    eco += battOut(hm) * dt;
    cumWO.push(eWO); cumW.push(eW); cumCO2.push(eco);
    pkWO = Math.max(pkWO, load(h)); pkW = Math.max(pkW, grid(h));
    pkWOa.push(pkWO); pkWa.push(pkW);
  }
  // normalise so each cumulative shape runs 0 → 1; savings shape = WO − W (monotonic, ≥0)
  var endWO = cumWO[N] || 1, endCO2 = cumCO2[N] || 1;
  var cumWOn = [], savN = [], cumCO2n = [], savRaw = [];
  for (i = 0; i <= N; i++) savRaw.push(cumWO[i] - cumW[i]);
  var endSav = savRaw[N] || 1;
  for (i = 0; i <= N; i++) { cumWOn.push(cumWO[i] / endWO); savN.push(savRaw[i] / endSav); cumCO2n.push(cumCO2[i] / endCO2); }
  function arr(a, hh) {
    if (hh <= H0) return a[0]; if (hh >= H1) return a[N];
    var f = (hh - H0) / dh, k = Math.floor(f); return a[k] + (a[k + 1] - a[k]) * (f - k);
  }

  /* ---------- graph geometry (pixels stay fixed; only labels are rescaled) ---------- */
  var GW = 460, GH = 200, PX0 = 12, PX1 = 448, PYT = 14, PYB = 168, KWMAX = 900;
  function gx(h)  { return PX0 + ((h - H0) / (H1 - H0)) * (PX1 - PX0); }
  function gy(kw) { return PYB - (kw / KWMAX) * (PYB - PYT); }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(name, attrs) { var e = document.createElementNS(SVGNS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

  var STEPS = 200;
  function ptsFor(fn) { var a = []; for (var j = 0; j <= STEPS; j++) { var hh = H0 + (j / STEPS) * (H1 - H0); a.push([gx(hh), gy(fn(hh)), hh]); } return a; }
  var LP = ptsFor(load), GP = ptsFor(grid);

  function lineUpTo(pts, hMax, fn) {
    var d = '', started = false;
    for (var j = 0; j < pts.length; j++) {
      if (pts[j][2] > hMax) break;
      d += (started ? 'L' : 'M') + pts[j][0].toFixed(1) + ' ' + pts[j][1].toFixed(1) + ' '; started = true;
    }
    var lx = gx(hMax), ly = gy(fn(hMax));
    d += (started ? 'L' : 'M') + lx.toFixed(1) + ' ' + ly.toFixed(1);
    return { d: d, x: lx, y: ly };
  }

  function buildGraph(container, side) {
    var svg = el('svg', { viewBox: '0 0 ' + GW + ' ' + GH, preserveAspectRatio: 'none' });
    svg.setAttribute('role', 'presentation');
    var defs = el('defs', {});
    if (side === 'without') {
      var lg = el('linearGradient', { id: 'lineWO', x1: PX0, y1: 0, x2: PX1, y2: 0, gradientUnits: 'userSpaceOnUse' });
      [['0','#8A938C'],['0.32','#8A938C'],['0.42','#F59E0B'],['0.48','#EF4444'],['0.56','#F59E0B'],['0.70','#8A938C'],['1','#8A938C']]
        .forEach(function (s) { lg.appendChild(el('stop', { offset: s[0], 'stop-color': s[1] })); });
      defs.appendChild(lg);
      var ag = el('linearGradient', { id: 'areaWO', x1: 0, y1: PYT, x2: 0, y2: PYB, gradientUnits: 'userSpaceOnUse' });
      ag.appendChild(el('stop', { offset: '0', 'stop-color': '#EF4444', 'stop-opacity': '0.16' }));
      ag.appendChild(el('stop', { offset: '1', 'stop-color': '#EF4444', 'stop-opacity': '0.02' }));
      defs.appendChild(ag);
    } else {
      var bg = el('linearGradient', { id: 'areaBatt', x1: 0, y1: PYT, x2: 0, y2: PYB, gradientUnits: 'userSpaceOnUse' });
      bg.appendChild(el('stop', { offset: '0', 'stop-color': '#3B82F6', 'stop-opacity': '0.34' }));
      bg.appendChild(el('stop', { offset: '1', 'stop-color': '#3B82F6', 'stop-opacity': '0.06' }));
      defs.appendChild(bg);
    }
    svg.appendChild(defs);

    // horizontal gridlines + y labels (kW) — labels captured for rescaling
    var yTexts = [];
    [0, 300, 600, 900].forEach(function (kw) {
      var y = gy(kw);
      svg.appendChild(el('line', { class: 'gl', x1: PX0, y1: y, x2: PX1, y2: y }));
      var t = el('text', { class: 'axis', x: PX0, y: y - 3 }); t.textContent = kw ? kw : ''; svg.appendChild(t);
      if (kw) yTexts.push({ node: t, base: kw });
    });
    var kwLbl = el('text', { class: 'axis', x: PX1, y: PYT - 4, 'text-anchor': 'end' }); kwLbl.textContent = 'kW'; svg.appendChild(kwLbl);
    [[6,'06h'],[12,'12h'],[18,'18h'],[24,'00h'],[30,'06h']].forEach(function (tk) {
      var x = gx(tk[0]);
      var t = el('text', { class: 'axis', x: x, y: PYB + 14, 'text-anchor': 'middle' }); t.textContent = tk[1]; svg.appendChild(t);
    });

    var refs = { svg: svg, side: side, yTexts: yTexts };
    if (side === 'with') {
      refs.ref = el('path', { class: 'ref', d: '' }); svg.appendChild(refs.ref);
      refs.area = el('path', { fill: 'url(#areaBatt)', stroke: 'none', d: '' }); svg.appendChild(refs.area);
      refs.line = el('path', { fill: 'none', stroke: '#2563EB', 'stroke-width': '2.6', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', d: '' }); svg.appendChild(refs.line);
      refs.dot = el('circle', { class: 'lead', r: '4', fill: '#2563EB', color: '#2563EB', cx: gx(H0), cy: gy(grid(H0)) }); svg.appendChild(refs.dot);
    } else {
      refs.area = el('path', { fill: 'url(#areaWO)', stroke: 'none', d: '' }); svg.appendChild(refs.area);
      refs.line = el('path', { fill: 'none', stroke: 'url(#lineWO)', 'stroke-width': '2.6', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', d: '' }); svg.appendChild(refs.line);
      refs.dot = el('circle', { class: 'lead', r: '4', fill: '#EF4444', color: '#EF4444', cx: gx(H0), cy: gy(load(H0)) }); svg.appendChild(refs.dot);
    }
    container.appendChild(svg);
    return refs;
  }

  var gWO = buildGraph(sim.querySelector('.bess-graph[data-side="without"]'), 'without');
  var gW  = buildGraph(sim.querySelector('.bess-graph[data-side="with"]'), 'with');

  (function () {
    var d = ''; for (var j = 0; j < LP.length; j++) d += (j ? 'L' : 'M') + LP[j][0].toFixed(1) + ' ' + LP[j][1].toFixed(1) + ' ';
    gW.ref.setAttribute('d', d);
  })();

  /* ---------- element refs ---------- */
  function $(id) { return document.getElementById(id); }
  var elClock = $('bessClock'),
      elWoDemand = $('woDemand'), elWoPrice = $('woPrice'), elWoCost = $('woCost'), elWoPeak = $('woPeak'), woPeakCell = $('woPeakCell'),
      elWDemand = $('wDemand'), elWBatt = $('wBatt'), elWCost = $('wCost'), elWSave = $('wSave'), elWSoc = $('wSoc'), elWCo2 = $('wCo2'),
      elSocFill = $('socFill'),
      elPriceWO = $('priceWithout'), elPriceW = $('priceWith'), markWO = $('markWithout'), markW = $('markWith'),
      cmpWO = $('cmpWithout'), cmpW = $('cmpWith'), cmpS = $('cmpSave'),
      panelWO = $('panelWithout'),
      simGrid = sim.querySelector('.bess-sim__grid'), simCompare = sim.querySelector('.bess-compare'),
      battUnit = $('battUnit'), battFill = $('battFill'),
      selMode = $('bessMode'), selRange = $('bessRange');

  /* ---------- formatters (language-aware) ---------- */
  function isEn() { return document.body.classList.contains('lang-en'); }
  function euro(v) { try { return new Intl.NumberFormat(isEn() ? 'en-US' : 'fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(v)); } catch (e) { return '€' + Math.round(v); } }
  function kwFmt(v) { try { return Math.round(v).toLocaleString(isEn() ? 'en-US' : 'fr-FR'); } catch (e) { return '' + Math.round(v); } }
  function priceFmt(v) { return isEn() ? ('€' + v.toFixed(2) + '/kWh') : (v.toFixed(2).replace('.', ',') + ' €/kWh'); }
  function unit(v, u) { return kwFmt(v) + ' <small>' + u + '</small>'; }

  /* ============================================================
     Profile selector — mode (power / bill) × size range.
     ============================================================ */
  var MODES = [
    { key: 'power', fr: 'Par puissance souscrite', en: 'By subscribed power' },
    { key: 'bill',  fr: "Par facture d'électricité", en: 'By electricity bill' }
  ];
  var RANGES = {
    power: [ // mid = midpoint peak kW (kVA ≈ kW)
      { mid: 68,   fr: '36–100 kVA',    en: '36–100 kVA' },
      { mid: 175,  fr: '100–250 kVA',   en: '100–250 kVA' },
      { mid: 625,  fr: '250 kVA–1 MW',  en: '250 kVA–1 MW' },
      { mid: 1500, fr: '1–2 MW',        en: '1–2 MW' },
      { mid: 2500, fr: '> 2 MW',        en: '> 2 MW' }
    ],
    bill: [ // mid = midpoint monthly € bill
      { mid: 6500,   fr: '3–10 k€/mois',  en: '€3–10k/month' },
      { mid: 20000,  fr: '10–30 k€/mois', en: '€10–30k/month' },
      { mid: 55000,  fr: '30–80 k€/mois', en: '€30–80k/month' },
      { mid: 110000, fr: '> 80 k€/mois',  en: '> €80k/month' }
    ]
  };
  var DEFAULT_RANGE = { power: 2, bill: 1 }; // mid-range default so the widget is never empty
  var state = { mode: 'power', range: 2 };

  function populateSelects() {
    var en = isEn();
    // mode
    selMode.innerHTML = '';
    MODES.forEach(function (m, idx) {
      var o = document.createElement('option');
      o.value = String(idx); o.textContent = en ? m.en : m.fr;
      selMode.appendChild(o);
    });
    var modeIdx = MODES.findIndex(function (m) { return m.key === state.mode; });
    selMode.value = String(modeIdx < 0 ? 0 : modeIdx);
    // range for current mode
    selRange.innerHTML = '';
    RANGES[state.mode].forEach(function (r, idx) {
      var o = document.createElement('option');
      o.value = String(idx); o.textContent = en ? r.en : r.fr;
      selRange.appendChild(o);
    });
    selRange.value = String(state.range);
  }

  /* ---------- profile → derived metrics ---------- */
  var P = {}; // active profile (endpoints + scale)

  function savingsRate(peakKW) {
    var lo = 68, hi = 2500;
    var t = (Math.log(Math.max(peakKW, lo) / lo)) / Math.log(hi / lo);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return EST.SAVINGS_MIN + (EST.SAVINGS_MAX - EST.SAVINGS_MIN) * t;
  }

  function computeProfile() {
    var r = RANGES[state.mode][state.range];
    var peakKW, annualBill;
    if (state.mode === 'power') {
      peakKW = r.mid;                                     // kVA ≈ kW
      annualBill = peakKW * EST.FULL_LOAD_HOURS * EST.BLENDED_PRICE;
    } else {
      annualBill = r.mid * 12;                            // monthly € → annual
      var annualKWh = annualBill / EST.BLENDED_PRICE;
      peakKW = annualKWh / EST.FULL_LOAD_HOURS;
    }
    var battPower  = EST.BATT_POWER_FRAC * peakKW;         // kW
    var battEnergy = battPower * EST.BATT_DURATION_H;      // kWh
    var rate       = savingsRate(peakKW);
    var annualSave = rate * annualBill;
    var capex      = EST.CAPEX_PER_KWH * battEnergy;
    var payback    = annualSave > 0 ? capex / annualSave : 0;

    P = {
      s:            peakKW / BASE_PEAK,     // amplitude scale vs base curves
      dailyCostWO:  annualBill / 365,
      dailySavings: annualSave / 365,
      dailyCO2:     battEnergy * EST.CO2_PER_KWH,
      payback:      payback
    };

    // rescale graph y-axis labels to the selected profile
    function nice(v) { if (v <= 0) return ''; var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10) - 1); return Math.round(v / p) * p; }
    [gWO, gW].forEach(function (g) {
      g.yTexts.forEach(function (t) { t.node.textContent = nice(t.base * P.s); });
    });

    // payback readout (both language copies)
    var pv = Math.round(P.payback * 10) / 10;
    var frTxt = pv.toFixed(1).replace('.', ',') + ' ans';
    var enTxt = pv.toFixed(1) + ' years';
    var nodes = sim.querySelectorAll('.bess-payback');
    if (nodes[0]) nodes[0].textContent = frTxt; // FR copy is first in DOM
    if (nodes[1]) nodes[1].textContent = enTxt;
  }

  function applyProfile() {
    computeProfile();
    render(lastPP); // refresh immediately (covers paused / reduced-motion states)
  }

  /* ---------- per-frame render ---------- */
  var DAY = 1.0, lastPP = 0;
  function edgeAlpha(pp) { var f = 0.035, a = 1; if (pp < f) a = pp / f; else if (pp > 1 - f) a = (1 - pp) / f; return a < 0 ? 0 : a; }
  function render(pp) {
    lastPP = pp;
    var s = P.s || 1;
    var h = pp < DAY ? H0 + (pp / DAY) * (H1 - H0) : H1;
    var ld = load(h) * s, bo = battOut(h) * s, gd = grid(h) * s, pr = priceV(h), so = socV(h);
    var cWO = arr(cumWOn, h) * P.dailyCostWO;
    var sav = arr(savN, h) * P.dailySavings;
    var cW = cWO - sav;
    var co2 = arr(cumCO2n, h) * P.dailyCO2;
    var pkWOv = arr(pkWOa, h) * s, pkWv = arr(pkWa, h) * s;

    // clock
    var hh = Math.floor(h) % 24, mm = Math.floor((h - Math.floor(h)) * 60);
    elClock.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;

    // price tier
    var frac = Math.max(0, Math.min(1, (pr - PMIN) / (PMAX - PMIN))) * 100;
    markWO.style.left = frac + '%'; markW.style.left = frac + '%';
    elPriceWO.textContent = priceFmt(pr); elPriceW.textContent = priceFmt(pr);

    // left counters
    elWoDemand.innerHTML = unit(ld, 'kW');
    elWoPrice.textContent = priceFmt(pr);
    elWoCost.textContent = euro(cWO);
    elWoPeak.innerHTML = unit(pkWOv, 'kW');

    // right counters
    elWDemand.innerHTML = unit(gd, 'kW');
    elWBatt.innerHTML = unit(bo, 'kW');
    elWCost.textContent = euro(cW);
    elWSave.textContent = euro(sav);
    elWSoc.textContent = Math.round(so) + ' %';
    elWCo2.innerHTML = unit(co2, 'kg');
    elSocFill.style.width = so + '%';

    // battery fill in illustration (clip rect y110..148, h=38)
    var fillH = 38 * so / 100; battFill.setAttribute('y', (148 - fillH).toFixed(1)); battFill.setAttribute('height', fillH.toFixed(1));

    // comparison band
    cmpWO.textContent = euro(cWO); cmpW.textContent = euro(cW); cmpS.textContent = euro(sav);

    // peak / hot state (expensive period)
    var hot = pr > 0.30;
    panelWO.classList.toggle('is-peak', hot);
    woPeakCell.classList.toggle('is-hot', hot);

    // battery glows / pulses while discharging
    battUnit.classList.toggle('is-active', bo > 6);

    // gentle fade across the loop seam
    var a = edgeAlpha(pp); simGrid.style.opacity = a; simCompare.style.opacity = a;

    // graphs (pixels use base shapes; amplitude scaling is reflected in the axis labels)
    var woL = lineUpTo(LP, h, load);
    gWO.line.setAttribute('d', woL.d);
    gWO.area.setAttribute('d', woL.d + ' L' + woL.x.toFixed(1) + ' ' + PYB + ' L' + PX0 + ' ' + PYB + ' Z');
    gWO.dot.setAttribute('cx', woL.x); gWO.dot.setAttribute('cy', woL.y);

    var wL = lineUpTo(GP, h, grid);
    gW.line.setAttribute('d', wL.d);
    gW.dot.setAttribute('cx', wL.x); gW.dot.setAttribute('cy', wL.y);
    var ad = '', any = false;
    for (var j = 0; j < GP.length; j++) { if (GP[j][2] > h) break; if (battOut(GP[j][2]) > 1) { ad += (any ? 'L' : 'M') + GP[j][0].toFixed(1) + ' ' + GP[j][1].toFixed(1) + ' '; any = true; } }
    if (any) {
      var back = '';
      for (var m = GP.length - 1; m >= 0; m--) { if (GP[m][2] > h) continue; if (battOut(GP[m][2]) > 1) back += 'L' + LP[m][0].toFixed(1) + ' ' + LP[m][1].toFixed(1) + ' '; }
      gW.area.setAttribute('d', ad + back + 'Z');
    } else { gW.area.setAttribute('d', ''); }
  }

  /* ---------- selector wiring ---------- */
  selMode.addEventListener('change', function () {
    state.mode = MODES[parseInt(selMode.value, 10) || 0].key;
    state.range = DEFAULT_RANGE[state.mode];
    populateSelects();
    applyProfile();
  });
  selRange.addEventListener('change', function () {
    state.range = parseInt(selRange.value, 10) || 0;
    applyProfile();
  });
  document.addEventListener('heliophile:lang', function () {
    populateSelects();          // relabel options in the new language
    render(lastPP);             // reformat numbers (€, kW) for the new locale
  });

  // init
  populateSelects();
  computeProfile();

  /* ---------- loop ---------- */
  var LOOP = 22000, start = null, raf = null, running = false;
  function frame(ts) {
    if (start === null) start = ts;
    var pp = ((ts - start) % LOOP) / LOOP;
    render(pp);
    raf = requestAnimationFrame(frame);
  }
  function play() { if (running) return; running = true; sim.classList.add('is-running'); start = null; raf = requestAnimationFrame(frame); }
  function pause() { running = false; sim.classList.remove('is-running'); if (raf) cancelAnimationFrame(raf); raf = null; }

  if (reduce) {
    render((17.5 - H0) / (H1 - H0)); // static peak-moment snapshot
  } else if ('IntersectionObserver' in window) {
    render(0);
    new IntersectionObserver(function (en) { en.forEach(function (e) { e.isIntersecting ? play() : pause(); }); }, { threshold: 0 }).observe(sim);
  } else { play(); }
})();
