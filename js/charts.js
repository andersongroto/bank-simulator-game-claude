/* Gráficos em canvas: linhas (com área para série única), barras divergentes e sparklines.
   Cores vêm dos tokens CSS, então acompanham o tema claro/escuro. */
(function (G) {
  'use strict';
  const BG = (G.BankGame = G.BankGame || {});
  const live = new Map(); // container -> { cfg, canvas, tip, ro }

  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }
  function resolve(color) {
    if (!color) return token('--s1');
    const m = /^var\((--[\w-]+)\)$/.exec(color);
    if (m) return token(m[1]);
    if (color.startsWith('--')) return token(color);
    return color;
  }

  function niceStep(range, target) {
    if (range <= 0 || !isFinite(range)) return 1;
    const raw = range / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    const step = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
    return step * mag;
  }

  function extent(cfg) {
    let min = Infinity;
    let max = -Infinity;
    for (const s of cfg.series) {
      for (const v of s.values) {
        if (v == null || !isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!isFinite(min)) { min = 0; max = 1; }
    if (cfg.type === 'bar' || cfg.zero) { min = Math.min(0, min); max = Math.max(0, max); }
    if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
    const step = niceStep(max - min, 4);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 0.001; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    return { lo, hi, ticks };
  }

  function roundedBar(ctx, x, y0, w, y1, r) {
    // Ponta arredondada só na extremidade do dado; base reta.
    const up = y1 < y0;
    const h = Math.abs(y1 - y0);
    r = Math.min(r, h, w / 2);
    ctx.beginPath();
    if (up) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1 + r);
      ctx.quadraticCurveTo(x, y1, x + r, y1);
      ctx.lineTo(x + w - r, y1);
      ctx.quadraticCurveTo(x + w, y1, x + w, y1 + r);
      ctx.lineTo(x + w, y0);
    } else {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1 - r);
      ctx.quadraticCurveTo(x, y1, x + r, y1);
      ctx.lineTo(x + w - r, y1);
      ctx.quadraticCurveTo(x + w, y1, x + w, y1 - r);
      ctx.lineTo(x + w, y0);
    }
    ctx.closePath();
    ctx.fill();
  }

  function draw(entry, hoverIdx) {
    const { cfg, canvas } = entry;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(50, rect.width);
    const H = Math.max(60, rect.height);
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const n = cfg.labels.length;
    const ink3 = token('--ink-3');
    const grid = token('--grid');
    const axis = token('--axis');
    const surface = token('--sheet');
    const font = '11px ' + (token('--f-ui') || 'sans-serif');
    ctx.font = font;

    if (!n) {
      ctx.fillStyle = ink3;
      ctx.textAlign = 'center';
      ctx.fillText('Sem dados ainda: feche o primeiro mês.', W / 2, H / 2);
      return;
    }

    const ex = extent(cfg);
    const fmt = cfg.format || ((v) => String(Math.round(v)));
    const axisFmt = cfg.axisFormat || fmt;
    let labelW = 0;
    for (const t of ex.ticks) labelW = Math.max(labelW, ctx.measureText(axisFmt(t)).width);
    const pad = { l: Math.ceil(labelW) + 10, r: 12, t: 10, b: 22 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    const y = (v) => pad.t + ph - ((v - ex.lo) / (ex.hi - ex.lo)) * ph;
    const isBar = cfg.type === 'bar';
    const slot = isBar ? pw / n : n > 1 ? pw / (n - 1) : pw;
    const x = (i) => (isBar ? pad.l + slot * (i + 0.5) : n > 1 ? pad.l + slot * i : pad.l + pw / 2);
    entry.geom = { pad, pw, ph, slot, n, isBar, x };

    // Grade e eixo Y
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of ex.ticks) {
      const yy = Math.round(y(t)) + 0.5;
      ctx.strokeStyle = t === 0 ? axis : grid;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(W - pad.r, yy);
      ctx.stroke();
      ctx.fillStyle = ink3;
      ctx.fillText(axisFmt(t), pad.l - 6, yy);
    }
    // Rótulos do eixo X
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const maxLabels = Math.max(2, Math.floor(pw / 70));
    const every = Math.max(1, Math.ceil(n / maxLabels));
    for (let i = n - 1; i >= 0; i -= every) {
      const lx = Math.min(Math.max(x(i), pad.l + 18), W - pad.r - 18);
      ctx.fillStyle = ink3;
      ctx.fillText(cfg.labels[i], lx, H - pad.b + 6);
    }

    if (isBar) {
      const s = cfg.series[0];
      const pos = resolve(s.color);
      const neg = resolve(cfg.negColor || '--neg');
      const bw = Math.max(1, Math.min(24, slot - 2));
      const y0 = y(0);
      for (let i = 0; i < n; i++) {
        const v = s.values[i];
        if (v == null || !isFinite(v)) continue;
        ctx.fillStyle = v >= 0 ? pos : neg;
        ctx.globalAlpha = hoverIdx == null || hoverIdx === i ? 1 : 0.55;
        roundedBar(ctx, x(i) - bw / 2, y0, bw, y(v), 4);
      }
      ctx.globalAlpha = 1;
    } else {
      const single = cfg.series.length === 1;
      for (const s of cfg.series) {
        const c = resolve(s.color);
        const pts = [];
        for (let i = 0; i < n; i++) {
          const v = s.values[i];
          if (v != null && isFinite(v)) pts.push([x(i), y(v)]);
        }
        if (!pts.length) continue;
        if (single && cfg.area !== false) {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], y(Math.max(ex.lo, Math.min(0, ex.hi))));
          for (const p of pts) ctx.lineTo(p[0], p[1]);
          ctx.lineTo(pts[pts.length - 1][0], y(Math.max(ex.lo, Math.min(0, ex.hi))));
          ctx.closePath();
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = c;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = c;
        pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.stroke();
        // Ponto final com anel na cor da superfície
        const last = pts[pts.length - 1];
        ctx.beginPath();
        ctx.arc(last[0], last[1], 6, 0, Math.PI * 2);
        ctx.fillStyle = surface;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(last[0], last[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
      }
      if (cfg.refLine != null && isFinite(cfg.refLine) && cfg.refLine >= ex.lo && cfg.refLine <= ex.hi) {
        const yy = Math.round(y(cfg.refLine)) + 0.5;
        ctx.strokeStyle = resolve('--gold');
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.l, yy);
        ctx.lineTo(W - pad.r, yy);
        ctx.stroke();
        ctx.setLineDash([]);
        if (cfg.refLabel) {
          ctx.fillStyle = resolve('--gold');
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(cfg.refLabel, pad.l + 4, yy - 2);
        }
      }
    }

    // Camada de hover
    if (hoverIdx != null && hoverIdx >= 0 && hoverIdx < n) {
      const hx = Math.round(x(hoverIdx)) + 0.5;
      if (!isBar) {
        ctx.strokeStyle = ink3;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, pad.t);
        ctx.lineTo(hx, pad.t + ph);
        ctx.stroke();
        ctx.globalAlpha = 1;
        for (const s of cfg.series) {
          const v = s.values[hoverIdx];
          if (v == null || !isFinite(v)) continue;
          ctx.beginPath();
          ctx.arc(hx, y(v), 6, 0, Math.PI * 2);
          ctx.fillStyle = surface;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(hx, y(v), 4, 0, Math.PI * 2);
          ctx.fillStyle = resolve(s.color);
          ctx.fill();
        }
      }
    }
  }

  function showTip(entry, idx, px, py) {
    const { cfg, tip, container } = entry;
    if (idx == null) { tip.hidden = true; return; }
    const fmt = cfg.format || ((v) => String(v));
    tip.textContent = '';
    const title = document.createElement('div');
    title.className = 'tip-title';
    title.textContent = cfg.labels[idx];
    tip.appendChild(title);
    for (const s of cfg.series) {
      const v = s.values[idx];
      const row = document.createElement('div');
      row.className = 'tip-row';
      const key = document.createElement('i');
      key.style.background = cfg.type === 'bar' && v < 0 ? resolve(cfg.negColor || '--neg') : resolve(s.color);
      const val = document.createElement('b');
      val.textContent = v == null || !isFinite(v) ? '—' : fmt(v);
      const name = document.createElement('span');
      name.textContent = s.name;
      row.append(key, val, name);
      tip.appendChild(row);
    }
    tip.hidden = false;
    const cw = container.clientWidth;
    const tw = tip.offsetWidth;
    let left = px + 14;
    if (left + tw > cw) left = px - tw - 14;
    tip.style.left = Math.max(0, left) + 'px';
    tip.style.top = Math.max(0, py - 20) + 'px';
  }

  function hitIndex(entry, clientX) {
    const g = entry.geom;
    if (!g) return null;
    const rect = entry.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    let i;
    if (g.isBar) i = Math.floor((px - g.pad.l) / g.slot);
    else i = g.n > 1 ? Math.round((px - g.pad.l) / g.slot) : 0;
    if (i < 0 || i >= g.n) return null;
    return i;
  }

  function render(container, cfg) {
    if (!container) return;
    let entry = live.get(container);
    if (!entry) {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('role', 'img');
      const tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.hidden = true;
      container.appendChild(canvas);
      container.appendChild(tip);
      entry = { container, canvas, tip, cfg };
      const move = (ev) => {
        const i = hitIndex(entry, ev.clientX);
        draw(entry, i);
        const r = container.getBoundingClientRect();
        showTip(entry, i, ev.clientX - r.left, ev.clientY - r.top);
      };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerdown', move);
      canvas.addEventListener('pointerleave', () => { draw(entry, null); showTip(entry, null); });
      if (typeof ResizeObserver !== 'undefined') {
        entry.ro = new ResizeObserver(() => draw(entry, null));
        entry.ro.observe(container);
      }
      live.set(container, entry);
    }
    entry.cfg = cfg;
    entry.canvas.setAttribute('aria-label', cfg.ariaLabel || cfg.series.map((s) => s.name).join(', '));
    draw(entry, null);
  }

  function legend(series, type) {
    if (!series || series.length < 2) return '';
    return '<div class="legend">' + series.map((s) => {
      const c = s.color && s.color.startsWith('--') ? `var(${s.color})` : s.color;
      return `<span><i class="${type === 'bar' ? 'box' : ''}" style="background:${c}"></i>${BG.U.escapeHtml(s.name)}</span>`;
    }).join('') + '</div>';
  }

  function spark(canvas, values, color) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(20, rect.width);
    const H = Math.max(10, rect.height);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const v = values.filter((x) => x != null && isFinite(x));
    if (v.length < 2) return;
    let lo = Math.min(...v);
    let hi = Math.max(...v);
    if (lo === hi) { lo -= 1; hi += 1; }
    const xs = (i) => 2 + ((W - 6) * i) / (v.length - 1);
    const ys = (val) => 3 + (H - 6) * (1 - (val - lo) / (hi - lo));
    const c = resolve(color || '--s1');
    ctx.beginPath();
    v.forEach((val, i) => (i ? ctx.lineTo(xs(i), ys(val)) : ctx.moveTo(xs(i), ys(val))));
    ctx.lineTo(xs(v.length - 1), H);
    ctx.lineTo(xs(0), H);
    ctx.closePath();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = c;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = c;
    v.forEach((val, i) => (i ? ctx.lineTo(xs(i), ys(val)) : ctx.moveTo(xs(i), ys(val))));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(xs(v.length - 1), ys(v[v.length - 1]), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  }

  // Remove gráficos cujos contêineres saíram da página
  function prune() {
    for (const [el, entry] of live) {
      if (!el.isConnected) {
        if (entry.ro) entry.ro.disconnect();
        live.delete(el);
      }
    }
  }
  function redrawAll() {
    prune();
    for (const entry of live.values()) draw(entry, null);
  }

  BG.Charts = { render, legend, spark, redrawAll, prune, resolve, token };
})(typeof globalThis !== 'undefined' ? globalThis : window);
