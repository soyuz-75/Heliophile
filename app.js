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

  /* ---------- Peak-shaving chart ---------- */
  var loads = [38, 52, 44, 70, 92, 60, 48, 84, 55, 42];
  var cap = 64, H = 150;
  function px(v) { return (v / 100) * H + 'px'; }

  function buildPlot(el, overColor) {
    if (!el) return;
    var capLine = document.createElement('div');
    capLine.className = 'chart__cap';
    capLine.style.bottom = px(cap);
    el.appendChild(capLine);

    loads.forEach(function (h) {
      var bar = document.createElement('div');
      bar.className = 'chart__bar';

      var over = document.createElement('div');
      over.className = 'chart__over';
      if (h > cap) {
        over.style.height = px(h - cap);
        over.style.background = overColor;
      } else {
        over.style.height = '0px';
      }

      var base = document.createElement('div');
      base.className = 'chart__base';
      base.style.height = px(Math.min(h, cap));
      base.style.borderRadius = h > cap ? '0' : '3px 3px 0 0';

      bar.appendChild(over);
      bar.appendChild(base);
      el.appendChild(bar);
    });
  }

  var accentVar = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#E2930E';
  buildPlot(document.getElementById('plotBefore'), '#DA6450');
  buildPlot(document.getElementById('plotAfter'), accentVar);

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
