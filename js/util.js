/* Utilitários compartilhados: RNG determinístico, matemática e formatação pt-BR. */
(function (G) {
  'use strict';
  const BG = (G.BankGame = G.BankGame || {});

  // ---------- Aleatoriedade determinística (mulberry32) ----------
  // O estado do gerador vive dentro do estado do jogo, então salvar/carregar
  // reproduz exatamente a mesma sequência de eventos.
  function rand(s) {
    let t = (s.rng.s = (s.rng.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randn(s) {
    let u = 0;
    while (u === 0) u = rand(s);
    const v = rand(s);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const chance = (s, p) => rand(s) < p;
  const range = (s, a, b) => a + (b - a) * rand(s);
  const randInt = (s, a, b) => Math.floor(range(s, a, b + 1));
  function pickWeighted(s, items, weightFn) {
    let total = 0;
    const ws = items.map((it) => {
      const w = Math.max(0, weightFn(it));
      total += w;
      return w;
    });
    if (total <= 0) return null;
    let r = rand(s) * total;
    for (let i = 0; i < items.length; i++) {
      r -= ws[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  // ---------- Matemática ----------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sum = (arr, fn) => arr.reduce((acc, x) => acc + (fn ? fn(x) : x), 0);
  const round2 = (v) => Math.round(v * 100) / 100;

  // ---------- Formatação ----------
  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const nfCache = {};
  function nf(min, max) {
    const k = min + ':' + max;
    if (!nfCache[k]) nfCache[k] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
    return nfCache[k];
  }
  const MINUS = '−';

  function fmtNum(v, digits = 0) {
    if (!isFinite(v)) return '—';
    const s = nf(digits, digits).format(Math.abs(v));
    return (v < 0 && Math.abs(v) >= 0.5 * Math.pow(10, -digits) ? MINUS : '') + s;
  }
  // Valores compactos: R$ 1,25 bi · R$ 850,3 mi · R$ 12,4 mil
  function fmtMoney(v, opts = {}) {
    if (!isFinite(v)) return '—';
    const a = Math.abs(v);
    const sign = v < 0 && a >= 0.5 ? MINUS : opts.plus && v > 0 ? '+' : '';
    let body;
    if (a >= 1e12) body = nf(2, 2).format(a / 1e12) + ' tri';
    else if (a >= 1e9) body = nf(2, 2).format(a / 1e9) + ' bi';
    else if (a >= 1e6) body = nf(1, 1).format(a / 1e6) + ' mi';
    else if (a >= 1e4) body = nf(1, 1).format(a / 1e3) + ' mil';
    else if (a >= 100 || a === 0) body = nf(0, 0).format(a);
    else body = nf(2, 2).format(a);
    return sign + 'R$ ' + body;
  }
  function fmtMoneyFull(v) {
    if (!isFinite(v)) return '—';
    return (v < 0 ? MINUS : '') + 'R$ ' + nf(0, 0).format(Math.abs(v));
  }
  // v já em pontos percentuais (10.5 => "10,5%")
  function fmtPct(v, digits = 1, opts = {}) {
    if (!isFinite(v)) return '—';
    const sign = v < 0 && Math.abs(v) >= 0.5 * Math.pow(10, -digits) ? MINUS : opts.plus && v > 0 ? '+' : '';
    return sign + nf(digits, digits).format(Math.abs(v)) + '%';
  }
  function fmtCompact(v) {
    const a = Math.abs(v);
    let body;
    if (a >= 1e9) body = nf(1, 1).format(a / 1e9) + ' bi';
    else if (a >= 1e6) body = nf(1, 1).format(a / 1e6) + ' mi';
    else if (a >= 1e4) body = nf(1, 1).format(a / 1e3) + ' mil';
    else body = nf(0, 0).format(a);
    return (v < 0 ? MINUS : '') + body;
  }
  const mod12 = (m) => ((m % 12) + 12) % 12;
  function monthLabel(m, startYear) {
    const y = startYear + Math.floor(m / 12);
    return MONTHS[mod12(m)] + '/' + String(y).slice(-2);
  }
  function monthLabelLong(m, startYear) {
    const y = startYear + Math.floor(m / 12);
    return MONTHS_FULL[mod12(m)] + ' de ' + y;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const deepClone = (o) => JSON.parse(JSON.stringify(o));

  BG.U = {
    rand, randn, chance, range, randInt, pickWeighted,
    clamp, lerp, sum, round2,
    fmtNum, fmtMoney, fmtMoneyFull, fmtPct, fmtCompact, monthLabel, monthLabelLong,
    escapeHtml, deepClone, MONTHS, MONTHS_FULL, MINUS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
