/* Interface: cabeçalho, navegação, telas, modais e notificações. */
(function (G) {
  'use strict';
  const BG = (G.BankGame = G.BankGame || {});
  const U = BG.U;
  const C = BG.CONFIG;
  const E = () => BG.Engine;
  const Game = () => BG.Game;
  const esc = U.escapeHtml;
  const money = U.fmtMoney;
  const pct = U.fmtPct;
  const num = U.fmtNum;

  const TABS = [
    { id: 'painel', label: 'Painel' },
    { id: 'produtos', label: 'Produtos e taxas' },
    { id: 'tesouraria', label: 'Tesouraria' },
    { id: 'operacoes', label: 'Operações' },
    { id: 'tecnologia', label: 'Tecnologia' },
    { id: 'relatorios', label: 'Relatórios' },
    { id: 'economia', label: 'Economia' },
    { id: 'mercado', label: 'Mercado' },
    { id: 'acionistas', label: 'Acionistas' },
    { id: 'conquistas', label: 'Conquistas' },
    { id: 'noticias', label: 'Notícias' },
    { id: 'ajuda', label: 'Como jogar' },
  ];

  const UI = {
    tab: 'painel',
    reportTab: 'dre',
    period: 'mes',
    newsFilter: 'all',
    amounts: {},
    menuOpen: false,
    modal: null,
    ng: { scenario: 'regional', difficulty: 'normal', duration: 240, bankName: '' },
  };

  // ======================================================================
  // Helpers de marcação
  // ======================================================================
  const ml = (s, m) => U.monthLabel(m, s.meta.startYear);
  const mlLong = (s, m) => U.monthLabelLong(m, s.meta.startYear);
  const chip = (cls, text) => `<span class="chip ${cls}">${esc(text)}</span>`;
  const meter = (frac, cls = '') => `<div class="meter ${cls}" role="presentation"><span style="width:${(U.clamp(frac, 0, 1) * 100).toFixed(1)}%"></span></div>`;
  const signed = (v) => (v > 0 ? 'good-text' : v < 0 ? 'bad-text' : '');
  function kv(pairs) {
    return '<dl class="kv">' + pairs.filter(Boolean).map(([k, v, cls]) => `<dt>${esc(k)}</dt><dd class="${cls || ''}">${v}</dd>`).join('') + '</dl>';
  }
  function panel(title, body, opts = {}) {
    return `<section class="panel ${opts.cls || ''}">
      <div class="panel-head"><div><h3 class="panel-title">${esc(title)}</h3>${opts.sub ? `<p class="panel-sub">${opts.sub}</p>` : ''}</div>${opts.head || ''}</div>
      ${body}
    </section>`;
  }
  function viewTitle(title, sub, right = '') {
    return `<div class="view-title"><div><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>`;
  }
  function seal(name) {
    const words = String(name).split(/\s+/).filter((w) => w && !/^(de|da|do|das|dos|e|o|a)$/i.test(w));
    const letters = (words[0] ? words[0][0] : 'B') + (words[1] ? words[1][0] : '');
    return esc(letters.toUpperCase());
  }
  function baselChip(b) {
    if (b < C.BASEL_MIN) return chip('bad', 'Abaixo do mínimo');
    if (b < 12.5) return chip('warn', 'Apertado');
    return chip('ok', 'Adequado');
  }
  function ratioChip(r) {
    if (r >= 0.95) return chip('ok', 'Adequado');
    if (r >= 0.75) return chip('warn', 'Sobrecarregado');
    return chip('bad', 'Insuficiente');
  }

  // Registro de gráficos da renderização atual
  let pendingCharts = {};
  let pendingSparks = {};
  function chartBox(id, cfg, cls = '') {
    pendingCharts[id] = cfg;
    return BG.Charts.legend(cfg.series, cfg.type) + `<div class="chart ${cls}" data-chart="${id}"></div>`;
  }
  function stat(label, value, sub, spark) {
    let sparkHtml = '';
    if (spark) {
      const id = 'sp' + Object.keys(pendingSparks).length;
      pendingSparks[id] = spark;
      sparkHtml = `<canvas class="spark" data-spark="${id}" aria-hidden="true"></canvas>`;
    }
    return `<div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-delta">${sub}</div>` : ''}${sparkHtml}</div>`;
  }
  function series(s, key, n = 36) {
    return s.history.slice(-n).map((h) => h[key]);
  }
  function labels(s, n = 36) {
    return s.history.slice(-n).map((h) => ml(s, h.m));
  }

  // ======================================================================
  // Cabeçalho e navegação
  // ======================================================================
  function renderHeader(s, m) {
    const h = s.history;
    const prev = h.length > 1 ? h[h.length - 2] : null;
    const last = s.last;
    const ni = last ? last.lucroLiquido : 0;
    const dEq = prev ? m.equity - prev.equity : 0;
    const dur = s.meta.duration;
    const sc = BG.SCENARIOS[s.meta.scenario];
    const df = BG.DIFFICULTY[s.meta.difficulty];
    const custDelta = last ? last.novosClientes - last.clientesPerdidos : 0;
    const auto = Game().auto;
    const disabled = s.over ? 'disabled' : '';
    document.getElementById('header').innerHTML = `
      <canvas class="guilloche" id="guilloche" aria-hidden="true"></canvas>
      <div class="brand">
        <div class="seal" aria-hidden="true">${seal(s.meta.bankName)}</div>
        <div style="min-width:0">
          <h1 class="bank-name">${esc(s.meta.bankName)}</h1>
          <div class="bank-sub">${esc(sc.name)} · ${esc(df.name)} · Rating ${esc(s.rating)}</div>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Caixa + Tesouro Selic</div><div class="kpi-value">${money(s.cash + s.lft)}</div><div class="kpi-sub">caixa ${money(s.cash)}</div></div>
        <div class="kpi"><div class="kpi-label">Patrimônio líquido</div><div class="kpi-value">${money(m.equity)}</div><div class="kpi-sub ${signed(dEq)}">${money(dEq, { plus: true })} no mês</div></div>
        <div class="kpi"><div class="kpi-label">Lucro do mês</div><div class="kpi-value ${signed(ni)}">${money(ni)}</div><div class="kpi-sub">12 meses: ${money(m.ni12)}</div></div>
        <div class="kpi"><div class="kpi-label">Basileia</div><div class="kpi-value ${m.basel < C.BASEL_MIN ? 'bad-text' : m.basel < 12.5 ? 'warn-text' : ''}">${pct(m.basel)}</div><div class="kpi-sub">mínimo ${pct(C.BASEL_MIN)}</div></div>
        <div class="kpi"><div class="kpi-label">Clientes</div><div class="kpi-value">${num(s.customers)}</div><div class="kpi-sub ${signed(custDelta)}">${custDelta >= 0 ? '+' : ''}${num(custDelta)} no mês</div></div>
        <div class="kpi"><div class="kpi-label">Reputação · Satisfação</div><div class="kpi-value">${num(s.reputation)} · ${num(s.satisfaction)}</div><div class="kpi-sub">de 100</div></div>
      </div>
      <div class="clock">
        <div class="date-block">
          <div class="date">${U.MONTHS[((s.month % 12) + 12) % 12]} ${s.meta.startYear + Math.floor(s.month / 12)}</div>
          <div class="date-sub">${dur ? `Mês ${s.month + 1} de ${dur}` : `Mês ${s.month + 1}`}</div>
        </div>
        <div class="controls">
          <button class="btn btn-primary btn-close-month" data-act="close-month" ${disabled} title="Atalho: barra de espaço">Fechar mês <span class="kbd" aria-hidden="true">espaço</span></button>
          <button class="btn btn-icon" data-act="toggle-auto" ${disabled} aria-pressed="${auto}" title="${auto ? 'Pausar' : 'Avanço automático'}" aria-label="${auto ? 'Pausar avanço automático' : 'Avanço automático'}">${auto ? '❚❚' : '▶'}</button>
          <select class="select" id="speed" data-bind="speed" aria-label="Velocidade do avanço automático">
            ${[['1', '1×'], ['2', '2×'], ['4', '4×']].map(([v, l]) => `<option value="${v}" ${String(Game().speed) === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <div class="menu-anchor">
            <button class="btn btn-icon" data-act="menu" aria-haspopup="true" aria-expanded="${UI.menuOpen}" aria-label="Menu do jogo">⋯</button>
            ${UI.menuOpen ? `<div class="menu" role="menu">
              <button role="menuitem" data-act="new-game">Novo jogo</button>
              <button role="menuitem" data-act="save-now">Salvar agora</button>
              <button role="menuitem" data-act="export">Exportar ou importar jogo</button>
              <div class="menu-sep"></div>
              <button role="menuitem" data-act="theme:light">Tema claro</button>
              <button role="menuitem" data-act="theme:dark">Tema escuro</button>
              <button role="menuitem" data-act="theme:system">Tema do sistema</button>
              <div class="menu-sep"></div>
              <button role="menuitem" data-act="tab:ajuda">Como jogar</button>
            </div>` : ''}
          </div>
        </div>
      </div>`;
    drawGuilloche();
  }

  // Padrão guilhoché (hipotrocoides em anel) emoldurando o selo, como o medalhão de uma cédula
  function drawGuilloche() {
    const c = document.getElementById('guilloche');
    const sealEl = document.querySelector('.note .seal');
    if (!c || !sealEl) return;
    const rect = c.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const col1 = BG.Charts.token('--guilloche');
    const col2 = BG.Charts.token('--guilloche-2');
    const sr = sealEl.getBoundingClientRect();
    const cx = sr.left - rect.left + sr.width / 2;
    const cy = sr.top - rect.top + sr.height / 2;
    const base = sr.width / 2;
    // Anel entre os raios a e b: R - r = (a + b) / 2, d = (b - a) / 2
    const ring = (a, b, ratio, turns, color) => {
      const k = (a + b) / 2;
      const d = (b - a) / 2;
      const r = k / ratio;
      const R = k + r;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      const steps = 2400;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2 * turns;
        const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
        const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
        if (i === 0) ctx.moveTo(cx + x, cy + y);
        else ctx.lineTo(cx + x, cy + y);
      }
      ctx.stroke();
    };
    ring(base + 2, base * 1.36, 2.93, 29, col1);
    ring(base * 1.3, base * 1.6, 4.11, 37, col2);
    // Faixa ondulada na borda superior
    ctx.lineWidth = 0.6;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.strokeStyle = k % 2 ? col2 : col1;
      for (let x = 0; x <= W; x += 3) {
        const y = 7 + k * 1.6 + Math.sin(x / 13 + k * 0.9) * 2.2 + Math.sin(x / 47 + k) * 1.4;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function renderNav(s, alerts) {
    const crit = alerts.filter((a) => a.level === 'bad').length;
    const unseen = Object.keys(s.achievements).length;
    document.getElementById('tabs').innerHTML = TABS.map((t) => {
      let badge = '';
      if (t.id === 'painel' && crit) badge = `<span class="badge" aria-label="${crit} alertas críticos">${crit}</span>`;
      if (t.id === 'conquistas' && unseen) badge = `<span class="badge gold" aria-label="${unseen} conquistas">${unseen}</span>`;
      return `<button class="tab" role="tab" data-act="tab:${t.id}" aria-selected="${UI.tab === t.id}">${esc(t.label)}${badge}</button>`;
    }).join('') + `<div class="nav-foot">Seu jogo é salvo automaticamente neste navegador a cada mês.</div>`;
  }

  // ======================================================================
  // Alertas
  // ======================================================================
  function computeAlerts(s, m) {
    const A = [];
    const add = (level, html, go, label) => A.push({ level, html, go, label });
    if (s.over) add('bad', '<strong>Fim de jogo.</strong> O banco foi encerrado pelo Banco Central.', null);
    if (s.pendingEvent) {
      const ev = BG.Events.byId[s.pendingEvent.id];
      add('info', `<strong>Decisão pendente:</strong> ${esc(ev ? ev.title : '')}.`, 'event', 'Decidir');
    }
    if (s.counters.baselCritical > 0) add('bad', `<strong>Intervenção iminente:</strong> Basileia abaixo de ${pct(C.BASEL_INTERVENTION)}. Faltam ${3 - s.counters.baselCritical} mês(es).`, 'acionistas', 'Levantar capital');
    if (m.basel < C.BASEL_MIN) add('bad', `<strong>Basileia em ${pct(m.basel)}:</strong> abaixo do mínimo de ${pct(C.BASEL_MIN)}. Novas concessões caem a 40% e dividendos estão proibidos. Levante capital, venda carteira ou reduza o crédito.`, 'acionistas', 'Ver capital');
    else if (m.basel < 12.5) add('warn', `<strong>Basileia em ${pct(m.basel)}:</strong> perto do mínimo regulatório. Cuidado com o crescimento do crédito.`, 'acionistas', 'Ver capital');
    if (s.redesconto > 0) add('bad', `<strong>Redesconto do Banco Central:</strong> ${money(s.redesconto)} a Selic + ${C.REDISCOUNT_SPREAD} p.p. ${s.counters.redesconto} mês(es) seguidos; com 6 o BC intervém.`, 'tesouraria', 'Tesouraria');
    if (s.reputation < 30) add('bad', `<strong>Reputação em ${num(s.reputation)}:</strong> risco de corrida bancária.`, 'operacoes', 'Ver operações');
    const last = s.last;
    if (last) {
      if (last.limites.includes('analistas')) {
        const served = last.demandaTotal > 0 ? last.originacaoTotal / last.demandaTotal : 1;
        add('warn', `<strong>Fila na análise de crédito:</strong> só ${pct(served * 100, 0)} da demanda foi atendida. Contrate analistas de crédito.`, 'operacoes', 'Contratar');
      }
      if (last.limites.includes('liquidez')) add('warn', '<strong>Falta de caixa</strong> limitou novos empréstimos. Capte mais (CDB, interbancário) ou reduza o caixa mínimo.', 'tesouraria', 'Tesouraria');
      if (last.lucroLiquido < 0) add('warn', `<strong>Prejuízo de ${money(-last.lucroLiquido)}</strong> no último mês. Veja a DRE.`, 'relatorios', 'Ver DRE');
    }
    const at = s.staff.atendimento / Math.max(1, E().idealAttendants(s));
    if (at < 0.9) add('warn', `<strong>Atendimento sobrecarregado:</strong> ${num(s.staff.atendimento)} atendentes para ${num(s.customers)} clientes (ideal: ${num(Math.ceil(E().idealAttendants(s)))}).`, 'operacoes', 'Contratar');
    const tiReq = E().requiredTI(s);
    if (s.staff.ti < tiReq) add('warn', `<strong>Equipe de TI pequena:</strong> ${s.staff.ti} de ${tiReq} necessários. Falhas de sistema ficam mais prováveis.`, 'operacoes', 'Contratar');
    if (s.satisfaction < 50) add('warn', `<strong>Satisfação em ${num(s.satisfaction)}:</strong> clientes estão indo embora.`, 'operacoes', 'Ver motivos');
    if (!A.length) add('good', '<strong>Tudo em ordem.</strong> Ajuste suas estratégias e feche o mês quando estiver pronto.', null);
    return A;
  }
  function alertsHtml(alerts) {
    const icon = { bad: '✕', warn: '!', info: 'i', good: '✓' };
    return '<div class="alerts" role="list">' + alerts.map((a) => `
      <div class="alert ${a.level}" role="listitem">
        <span class="alert-icon" aria-hidden="true">${icon[a.level]}</span>
        <span class="alert-text">${a.html}</span>
        ${a.go ? `<button class="btn btn-sm" data-act="${a.go === 'event' ? 'open-event' : 'tab:' + a.go}">${esc(a.label)}</button>` : '<span></span>'}
      </div>`).join('') + '</div>';
  }

  // ======================================================================
  // Telas
  // ======================================================================
  const VIEWS = {};

  VIEWS.painel = (s, m, alerts) => {
    const ph = BG.PHASES[s.eco.phase];
    const h = s.history;
    const assets12 = h.length > 12 ? h[h.length - 13].assets : null;
    const growth = assets12 ? (m.assets / assets12 - 1) * 100 : null;
    const mods = s.modifiers.filter((x) => x.label);
    return `
      ${viewTitle('Painel', `${esc(mlLong(s, s.month))} · economia em ${esc(ph.name.toLowerCase())} · Selic ${pct(s.eco.selic, 2)}`)}
      ${alertsHtml(alerts)}
      <div class="stats">
        ${stat('Ativos totais', money(m.assets), growth != null ? `${pct(growth, 1, { plus: true })} em 12 meses` : 'tamanho do balanço', { values: series(s, 'assets'), color: '--s1' })}
        ${stat('Lucro em 12 meses', `<span class="${signed(m.ni12)}">${money(m.ni12)}</span>`, `ROE ${pct(m.roe12)}`, { values: series(s, 'ni'), color: '--s1' })}
        ${stat('Carteira de crédito', money(m.loans), `inadimplência ${pct(m.npl)} ao ano`, { values: series(s, 'loans'), color: '--s1' })}
        ${stat('Depósitos', money(m.deposits), `crédito/depósitos ${pct(m.ldr, 0)}`, { values: series(s, 'deposits'), color: '--s1' })}
        ${stat('Índice de Basileia', pct(m.basel), baselChip(m.basel), { values: series(s, 'basel'), color: '--s1' })}
        ${stat('Valor de mercado', money(m.valuation), `sua parte: ${money(m.stake)}`, { values: series(s, 'valuation'), color: '--s1' })}
      </div>
      <div class="grid grid-2">
        ${panel('Lucro líquido mensal', chartBox('ni', { type: 'bar', labels: labels(s, 24), series: [{ name: 'Lucro líquido', values: series(s, 'ni', 24), color: '--s1' }], format: money, axisFormat: U.fmtCompact }), { sub: 'Últimos 24 meses' })}
        ${panel('Balanço', chartBox('bal', { labels: labels(s), series: [{ name: 'Ativos', values: series(s, 'assets'), color: '--s1' }, { name: 'Depósitos', values: series(s, 'deposits'), color: '--s2' }, { name: 'Crédito', values: series(s, 'loans'), color: '--s3' }], format: money, axisFormat: U.fmtCompact, zero: true }), { sub: 'Últimos 36 meses' })}
      </div>
      <div class="grid grid-2">
        ${panel('Clientes', chartBox('cust', { labels: labels(s), series: [{ name: 'Clientes', values: series(s, 'customers'), color: '--s1' }], format: (v) => num(v), axisFormat: U.fmtCompact, zero: true }, 'short'), { sub: `Mercado potencial: ${num(E().addressable(s))} pessoas` })}
        ${panel('Economia', kv([
          ['Fase do ciclo', esc(ph.name)],
          ['Selic', pct(s.eco.selic, 2)],
          ['Inflação (12 meses)', pct(s.eco.inflation)],
          ['PIB (anualizado)', pct(s.eco.gdp, 1, { plus: true })],
          ['Desemprego', pct(s.eco.unemployment)],
          ['Ibovespa', num(s.eco.stock) + ' pts'],
        ]) + (mods.length ? `<div class="divider"></div><div class="eyebrow" style="margin:8px 0 6px">Efeitos em andamento</div><div class="row">${mods.map((x) => chip(modTone(x), `${x.label} · ${x.months} ${x.months === 1 ? 'mês' : 'meses'}`)).join('')}</div>` : ''), { head: `<button class="btn btn-sm btn-ghost" data-act="tab:economia">Detalhes</button>` })}
      </div>
      ${panel('Últimas notícias', newsList(s, s.news.slice(-8).reverse()), { head: `<button class="btn btn-sm btn-ghost" data-act="tab:noticias">Todas</button>` })}
    `;
  };

  // Classifica um efeito temporário como favorável, desfavorável ou neutro
  function modTone(x) {
    const additive = x.kind === 'reputation' || x.kind === 'satisfaction';
    const goodWhenHigh = ['acquisition', 'demand', 'origination', 'reputation', 'satisfaction'].includes(x.kind);
    const badWhenHigh = ['default', 'churn', 'cdbMarket', 'compulsory', 'newRisk'].includes(x.kind);
    const up = additive || ['cdbMarket', 'compulsory', 'churn'].includes(x.kind) ? x.value > 0 : x.value > 1;
    if (goodWhenHigh) return up ? 'ok' : 'warn';
    if (badWhenHigh) return up ? 'warn' : 'ok';
    return 'info';
  }

  function newsList(s, items) {
    if (!items.length) return '<p class="muted">Nenhuma notícia ainda.</p>';
    return '<div class="news">' + items.map((n) => `
      <div class="news-item ${esc(n.type)}"><span class="news-date">${esc(ml(s, n.m))}</span><span class="news-dot" aria-hidden="true"></span><span>${esc(n.text)}</span></div>`).join('') + '</div>';
  }

  // ---------------- Produtos ----------------
  function rateControl(id, value, min, max, step, market, unit, marketLabel) {
    const pos = U.clamp(((market - min) / (max - min)) * 100, 3, 97);
    return `<div class="rate-line">
      <div class="range-wrap">
        <span class="range-mark" style="left:${pos}%">${esc(marketLabel)}</span>
        <input type="range" id="r-${id}" min="${min}" max="${max}" step="${step}" value="${value}" data-bind="${id}" aria-label="Taxa">
      </div>
      <div class="rate-input"><input type="number" id="n-${id}" min="${min}" max="${max}" step="${step}" value="${value}" data-bind="${id}" aria-label="Valor">${unit}</div>
    </div>`;
  }

  VIEWS.produtos = (s, m) => {
    const e = s.eco;
    const P = s.P;
    const last = s.last || {};
    const mFee = C.MARKET_FEE * P;
    const savY = BG.Economy.savingsYield(e.selic);
    const cdbMkt = E().cdbMarketPct(s);
    const cdbRate = (e.selic * s.cdbPct) / 100;
    const broker = E().brokerTarget(s, m.equity);
    const cap = E().analystCapacity(s);
    const demand = last.demandaTotal || 0;
    const served = demand > 0 ? (last.originacaoTotal || 0) / demand : 1;
    const feeMax = Math.ceil(80 * P);

    const captacao = `
      <div class="grid grid-3">
        <div class="product">
          <div><div class="product-name">Conta corrente</div><p class="product-desc">Depósitos à vista não pagam juros: é o dinheiro mais barato do banco. A tarifa mensal gera receita, mas espanta clientes.</p></div>
          <div class="facts"><span>Saldo <b>${money(s.deposits.checking)}</b></span><span>Receita de tarifas <b>${money(last.tarifas || 0)}</b>/mês</span></div>
          <div class="field"><span class="label">Tarifa mensal por cliente (R$)</span>${rateControl('fee', s.fee.toFixed(1), 0, feeMax, 0.5, mFee, 'R$', `mercado ${money(mFee)}`)}</div>
        </div>
        <div class="product">
          <div><div class="product-name">Poupança</div><p class="product-desc">Rendimento definido por lei: 6,17% ao ano + TR quando a Selic passa de 8,5%; 70% da Selic abaixo disso. Isenta de imposto, atrai clientes conservadores.</p></div>
          <div class="facts"><span>Saldo <b>${money(s.deposits.savings)}</b></span><span>Rende <b>${pct(savY, 2)}</b> ao ano</span><span>Custo <b>${money(last.jurosPoupanca || 0)}</b>/mês</span></div>
          <p class="small muted">Com a Selic alta, o dinheiro migra da poupança para aplicações que pagam mais.</p>
        </div>
        <div class="product">
          <div><div class="product-name">CDB</div><p class="product-desc">Você define quanto paga em % do CDI. Pagar acima do mercado atrai dinheiro de clientes e de investidores das plataformas, mas encarece a captação.</p></div>
          <div class="facts"><span>Saldo <b>${money(s.deposits.cdb)}</b></span><span>Paga <b>${pct(cdbRate, 2)}</b> ao ano</span><span>Custo <b>${money(last.jurosCdb || 0)}</b>/mês</span></div>
          <div class="field"><span class="label">Remuneração (% do CDI)</span>${rateControl('cdb', s.cdbPct, 70, 160, 1, cdbMkt, '%', `mercado ${num(cdbMkt)}%`)}</div>
          <p class="small muted">${broker > 0 ? `Plataformas de investimento devem trazer cerca de ${money(broker)} em CDBs.` : `Acima de ${num(cdbMkt + 2)}% do CDI, as plataformas de investimento passam a distribuir seu CDB.`}</p>
        </div>
      </div>`;

    const credito = BG.PRODUCT_KEYS.map((k) => {
      const p = BG.PRODUCTS[k];
      const pr = s.products[k];
      const mk = E().marketRate(s, k);
      const capR = E().rateCap(s, k);
      const min = Math.max(0, Math.floor(e.selic - 2));
      const max = Math.ceil(Math.max(e.selic + p.spread * 2.5 + 15, pr.rate + 5));
      const rd = E().rateDemand(s, k);
      const dr = E().monthlyDefaultRate(s, k) * 12 * 100;
      const newRisk = E().newLoanRisk(s, k);
      const diff = pr.rate - mk;
      return `<div class="panel product">
        <div class="product-head">
          <div><div class="product-name">${esc(p.name)}</div><p class="product-desc">${esc(p.desc)}</p></div>
          <div class="row">${capR != null ? chip('warn', `Teto ${pct(capR)}`) : ''}${chip(Math.abs(diff) < 0.5 ? 'info' : diff > 0 ? 'warn' : 'ok', `${diff >= 0 ? '+' : ''}${num(diff, 1)} p.p. vs mercado`)}</div>
        </div>
        <div class="facts">
          <span>Carteira <b>${money(pr.balance)}</b></span>
          <span>Taxa média da carteira <b>${pct(pr.avgRate)}</b></span>
          <span>Concedido no mês <b>${money((last.originacao || {})[k] || 0)}</b></span>
          <span>Perdas no mês <b>${money((last.perdasBy || {})[k] || 0)}</b></span>
        </div>
        <div class="field"><span class="label">Taxa para novos contratos (% ao ano)</span>${rateControl('rate:' + k, pr.rate.toFixed(1), min, max, 0.1, mk, '%', `mercado ${pct(mk)}`)}</div>
        <div class="row-between">
          <div class="field"><span class="label">Política de concessão</span>
            <div class="seg" role="group" aria-label="Política de concessão">${BG.POLICY_KEYS.map((pk) => `<button data-act="policy:${k}:${pk}" aria-pressed="${pr.policy === pk}" title="${esc(BG.POLICIES[pk].desc)}">${esc(BG.POLICIES[pk].name)}</button>`).join('')}</div>
          </div>
          <div class="facts">
            <span>Demanda pela taxa <b class="${rd >= 1 ? 'good-text' : rd < 0.7 ? 'bad-text' : ''}">${pct(rd * 100, 0)}</b></span>
            <span>Calote esperado <b>${pct(dr)}</b> ao ano</span>
            <span>Risco dos novos <b>${num(newRisk, 2)}×</b></span>
          </div>
        </div>
      </div>`;
    }).join('');

    const big = s.bigLoans.length ? panel('Operações estruturadas', `<div class="table-wrap"><table class="ledger">
        <thead><tr><th>Cliente</th><th>Nota</th><th class="n">Saldo</th><th class="n">Taxa</th><th class="n">Meses restantes</th></tr></thead>
        <tbody>${s.bigLoans.map((b) => `<tr><td>${esc(b.name)}</td><td>${esc(b.grade)}</td><td class="n">${money(b.amount)}</td><td class="n">${pct(b.rate)}</td><td class="n">${b.monthsLeft}</td></tr>`).join('')}</tbody>
      </table></div>`, { sub: 'Empréstimos sob medida para grandes empresas, negociados em eventos.' }) : '';

    return `
      ${viewTitle('Produtos e taxas', 'Defina quanto você paga para captar dinheiro e quanto cobra para emprestá-lo. Mudanças nas taxas de crédito valem só para novos contratos.')}
      ${panel('Captação', captacao, { sub: `Depósitos totais: ${money(m.deposits)} · custo médio ${pct(m.deposits > 0 ? (((last.jurosPoupanca || 0) + (last.jurosCdb || 0)) * 12 / m.deposits) * 100 : 0)} ao ano` })}
      ${panel('Crédito', `<div class="stack">
        <div class="row">
          ${chip(served >= 0.99 ? 'ok' : served > 0.8 ? 'warn' : 'bad', `Análise: ${money(cap)}/mês de capacidade`)}
          <span class="small muted">Demanda no último mês ${money(demand)} · atendida ${pct(served * 100, 0)} · força de vendas ${pct(E().salesFactor(s) * 100, 0)}</span>
          ${s.flags.restricted ? chip('bad', 'Concessões restritas pelo BC') : ''}
        </div>
      </div>`, { sub: `Carteira total: ${money(m.loans)} · inadimplência ${pct(m.npl)} ao ano` })}
      ${credito}
      ${big}
    `;
  };

  // ---------------- Tesouraria ----------------
  function amountField(key, max) {
    const v = UI.amounts[key] != null ? UI.amounts[key] : '';
    return `<div class="row" style="flex-wrap:nowrap">
      <input class="input input-money" type="number" min="0" step="any" inputmode="decimal" id="amt-${key}" data-bind="amount:${key}" value="${v}" placeholder="Valor em R$" aria-label="Valor em reais">
    </div>
    <div class="btn-row">${[0.1, 0.25, 0.5, 1].map((f) => `<button class="btn btn-xs" data-act="fill:${key}:${Math.floor(max * f)}">${f === 1 ? 'Tudo' : pct(f * 100, 0)}</button>`).join('')}</div>`;
  }

  VIEWS.tesouraria = (s, m) => {
    const e = s.eco;
    const dep = m.deposits;
    const minCash = (s.treasury.minCashPct / 100) * dep;
    const avail = s.cash + s.lft;
    const ibRate = E().interbankRate(s);
    const req = E().requiredCompulsory(s);
    const rows = [
      { key: 'lft', name: 'Tesouro Selic (LFT)', bal: s.lft, ret: `${pct(e.selic, 2)} ao ano, sem risco de preço`, buyMax: s.cash, sellMax: s.lft },
      { key: 'ltn', name: 'Prefixado (LTN, ~3 anos)', bal: s.ltn.value, ret: s.ltn.value > 0 ? `travado em ${pct(s.ltn.rate, 2)}; mercado ${pct(e.prefix, 2)}` : `mercado paga ${pct(e.prefix, 2)} ao ano`, buyMax: avail, sellMax: s.ltn.value },
      { key: 'stocks', name: 'Ações (índice Ibovespa)', bal: s.stocks, ret: `último mês ${pct((e.stockReturn || 0) * 100, 1, { plus: true })}`, buyMax: avail, sellMax: s.stocks },
    ];
    return `
      ${viewTitle('Tesouraria', 'Administre a liquidez do banco: quanto fica em caixa, onde aplicar o excedente e como se financiar no curto prazo.')}
      <div class="stats">
        ${stat('Caixa', money(s.cash), `mínimo desejado ${money(minCash)}`)}
        ${stat('Depósito compulsório', money(s.compulsory), `exigido ${money(req)}`)}
        ${stat('Tesouro Selic', money(s.lft), 'liquidez diária')}
        ${stat('Índice de liquidez', pct(m.liquidity), 'ativos líquidos / depósitos')}
        ${stat('Interbancário', money(s.interbank), `limite ${money(m.interbankLimit)}`)}
        ${stat('Redesconto do BC', `<span class="${s.redesconto > 0 ? 'bad-text' : ''}">${money(s.redesconto)}</span>`, `Selic + ${C.REDISCOUNT_SPREAD} p.p.`)}
      </div>
      <div class="grid grid-2">
        ${panel('Política de caixa', `<div class="stack">
          <div class="field"><span class="label">Caixa mínimo (% dos depósitos)</span>${rateControl('mincash', s.treasury.minCashPct, 2, 40, 1, 8, '%', 'usual 8%')}</div>
          <label class="switch"><input type="checkbox" id="auto-treasury" data-bind="auto" ${s.treasury.auto ? 'checked' : ''}> Aplicar o excedente em Tesouro Selic e resgatar quando faltar caixa</label>
          <p class="small muted">Com a gestão automática ligada, o caixa acima do mínimo vai para o Tesouro Selic no fechamento do mês, e o Tesouro Selic cobre novos empréstimos quando o caixa não basta. Se o caixa ficar negativo, o banco vende ativos e, em último caso, recorre ao redesconto do Banco Central, que é caro e prejudica a reputação.</p>
        </div>`)}
        ${panel('Captação interbancária', `<div class="stack">
          ${kv([['Dívida atual', money(s.interbank)], ['Taxa', `${pct(ibRate, 2)} ao ano (rating ${esc(s.rating)})`], ['Limite', money(m.interbankLimit)]])}
          ${amountField('ib', Math.max(0, m.interbankLimit - s.interbank))}
          <div class="btn-row"><button class="btn btn-sm" data-act="borrow">Tomar emprestado</button><button class="btn btn-sm" data-act="repay">Quitar</button></div>
          <p class="small muted">Dinheiro rápido de outros bancos. Útil para cobrir falta de caixa sem pagar o redesconto, mas custa mais que a Selic.</p>
        </div>`)}
      </div>
      ${panel('Investimentos', `<div class="grid grid-3">${rows.map((r) => `<div class="stack">
          <div><div class="product-name">${esc(r.name)}</div><div class="small muted">${r.ret}</div></div>
          <div class="facts"><span>Saldo <b>${money(r.bal)}</b></span></div>
          ${amountField(r.key, Math.max(r.buyMax, r.sellMax))}
          <div class="btn-row"><button class="btn btn-sm" data-act="trade:${r.key}:buy">Comprar</button><button class="btn btn-sm" data-act="trade:${r.key}:sell">Vender</button></div>
        </div>`).join('')}</div>
        <p class="small muted" style="margin-top:12px">Prefixados ganham quando os juros caem e perdem quando sobem (duração de ${num(C.LTN_DURATION, 1)} anos). Ações oscilam com a bolsa e pesam 250% nos ativos de risco do Índice de Basileia.</p>`, { sub: `Liquidez disponível agora: ${money(avail)}` })}
    `;
  };

  // ---------------- Operações ----------------
  VIEWS.operacoes = (s, m) => {
    const P = s.P;
    const needs = {
      atendimento: E().idealAttendants(s),
      gerentes: E().idealManagers(s),
      analistas: s.last ? s.last.demandaTotal / (C.ANALYST_CAPACITY * P * (1 + 0.1 * s.tech.credito.level)) : s.staff.analistas,
      ti: E().requiredTI(s),
    };
    const payroll = U.sum(BG.ROLE_KEYS, (r) => s.staff[r] * E().salary(s, r));
    const staffRows = BG.ROLE_KEYS.map((r) => {
      const def = BG.ROLES[r];
      const need = Math.ceil(needs[r]);
      const ratio = s.staff[r] / Math.max(1, needs[r]);
      const sal = E().salary(s, r);
      return `<tr>
        <td><div style="font-weight:600">${esc(def.plural)}</div><div class="tiny muted">${esc(def.desc)}</div></td>
        <td class="n">${num(s.staff[r])}</td>
        <td class="n">${num(need)}</td>
        <td>${ratioChip(ratio)}</td>
        <td class="n">${U.fmtMoneyFull(sal)}</td>
        <td><div class="btn-row" style="flex-wrap:nowrap">
          <button class="btn btn-xs" data-act="fire:${r}:10" aria-label="Desligar 10">−10</button>
          <button class="btn btn-xs" data-act="fire:${r}:1" aria-label="Desligar 1">−1</button>
          <button class="btn btn-xs" data-act="hire:${r}:1" aria-label="Contratar 1">+1</button>
          <button class="btn btn-xs" data-act="hire:${r}:10" aria-label="Contratar 10">+10</button>
          ${s.staff[r] < need ? `<button class="btn btn-xs btn-primary" data-act="hire:${r}:${need - s.staff[r]}">Completar (+${num(need - s.staff[r])})</button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
    const sat = E().satisfactionBreakdown(s);
    const acq = E().acquisitionInfo(s);
    const app = s.tech.app.level;
    const mktMax = Math.max(2000000 * P, Math.ceil((m.assets * 0.003) / 100000) * 100000);
    const camp = Object.entries(BG.CAMPAIGNS).map(([k, c]) => {
      const until = s.flags.campaigns[k] || -999;
      const wait = until - s.month;
      return `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--rule)">
        <div style="min-width:0;flex:1"><div style="font-weight:600">${esc(c.name)}</div><div class="tiny muted">${esc(c.desc)}</div></div>
        <button class="btn btn-sm" data-act="campaign:${k}" ${wait > 0 ? 'disabled' : ''}>${wait > 0 ? `em ${wait} mês(es)` : money(c.cost * P)}</button>
      </div>`;
    }).join('');
    return `
      ${viewTitle('Operações', 'Equipe, agências, caixas eletrônicos e marketing. É aqui que se decide a experiência do cliente e o custo de servi-lo.')}
      ${panel('Equipe', `<div class="table-wrap"><table class="ledger">
          <thead><tr><th>Função</th><th class="n">Pessoas</th><th class="n">Necessário</th><th>Situação</th><th class="n">Salário</th><th>Ajustar</th></tr></thead>
          <tbody>${staffRows}</tbody>
        </table></div>
        <p class="small muted" style="margin-top:10px">Contratar custa um salário (recrutamento e treinamento). Desligar custa dois salários de rescisão. Cortes acima de 10% da equipe viram notícia.</p>`,
      { sub: `Folha mensal: ${money(payroll)} · reajustes acumulados ${pct((s.salaryIndex - 1) * 100, 1, { plus: true })}` })}
      ${s.executives.length ? panel('Diretoria', `<div class="stack">${s.executives.map((x, i) => `<div class="row-between"><div><b>${esc(x.name)}</b> · ${esc(x.role)}<div class="tiny muted">${esc(x.desc)} · ${money(x.salary * P)}/mês</div></div><button class="btn btn-sm btn-danger" data-act="fire-exec:${i}">Dispensar (6 salários)</button></div>`).join('')}</div>`) : ''}
      <div class="grid grid-2">
        ${panel('Agências e caixas eletrônicos', `<div class="stack">
          ${kv([
            ['Agências', num(s.branches)],
            ['Clientes por agência', s.branches ? num(s.customers / s.branches) : '—'],
            ['Custo mensal por agência', money(C.BRANCH.monthly * P)],
            ['Caixas eletrônicos', `${num(s.atms)} (ideal ${s.branches ? num(Math.ceil(s.customers / (C.ATM.custPer * (1 + 0.5 * app)))) : '0'})`],
          ])}
          <div class="btn-row">
            <button class="btn btn-sm btn-primary" data-act="open-branch">Abrir agência · ${money(C.BRANCH.cost * P)}</button>
            <button class="btn btn-sm" data-act="close-branch" ${s.branches ? '' : 'disabled'}>Fechar agência</button>
          </div>
          <div class="btn-row">
            <button class="btn btn-sm" data-act="atm:1">+1 caixa eletrônico · ${money(C.ATM.cost * P)}</button>
            <button class="btn btn-sm" data-act="atm:5">+5</button>
            <button class="btn btn-sm" data-act="atm:-1" ${s.atms ? '' : 'disabled'}>−1</button>
          </div>
          <p class="small muted">Cada agência alcança ${num(C.BRANCH.reach)} novos potenciais clientes. Agências lotadas (mais de ${num(C.BRANCH.custIdeal)} clientes cada) derrubam a satisfação, a não ser que o app seja muito bom.</p>
        </div>`)}
        ${panel('Marketing', `<div class="stack">
          <div class="field"><span class="label">Verba mensal (R$)</span>${rateControl('marketing', Math.round(s.marketing), 0, mktMax, 10000, 150000 * P, '', 'referência')}</div>
          <div><div class="row-between small"><span>Reconhecimento da marca</span><b>${pct(s.awareness * 100, 0)}</b></div>${meter(s.awareness)}</div>
          <div>${camp}</div>
        </div>`)}
      </div>
      <div class="grid grid-2">
        ${panel('Satisfação dos clientes', `<div class="stack">
          <div class="row-between"><span>Atual</span><b>${num(s.satisfaction)} / 100</b></div>
          ${meter(s.satisfaction / 100, s.satisfaction < 50 ? 'bad' : s.satisfaction < 65 ? 'warn' : 'good')}
          <div class="table-wrap"><table class="ledger"><tbody>
            <tr><td>Base</td><td class="n">${num(sat.base)}</td></tr>
            ${sat.parts.map((p) => `<tr class="indent"><td>${esc(p.label)}</td><td class="n ${signed(p.value)}">${p.value >= 0 ? '+' : ''}${num(p.value, 1)}</td></tr>`).join('')}
            <tr class="total"><td>Tendência</td><td class="n">${num(sat.total)}</td></tr>
          </tbody></table></div>
          <p class="small muted">A satisfação caminha aos poucos para a tendência. Clientes insatisfeitos cancelam a conta e afastam novos clientes.</p>
        </div>`)}
        ${panel('Mercado potencial e clientes', `<div class="stack">
          ${kv([
            ['Alcance das agências', num(s.branches * C.BRANCH.reach)],
            ['Alcance digital (app nível ' + app + ')', num(E().digitalReach(s))],
            ['Sede e indicações', num(C.HQ_REACH)],
            ['Mercado potencial', `<b>${num(acq.addressable)}</b>`],
            ['Ainda não são clientes', num(acq.pool)],
            ['Atratividade do banco', pct(acq.attractiveness * 100, 0)],
            ['Novos clientes previstos/mês', num(acq.newCust)],
            ['Cancelamentos previstos/mês', `${num(acq.churn)} (${pct(acq.churnRate * 100, 2)})`],
          ])}
          <p class="small muted">A atratividade combina tarifa, CDB, satisfação, reputação e campanhas. O reconhecimento da marca multiplica tudo.</p>
        </div>`)}
      </div>
    `;
  };

  // ---------------- Tecnologia ----------------
  VIEWS.tecnologia = (s) => {
    const tiReq = E().requiredTI(s);
    const cards = BG.TECH_KEYS.map((k) => {
      const d = BG.TECH[k];
      const t = s.tech[k];
      const pips = [1, 2, 3, 4, 5].map((i) => `<span class="pip ${i <= t.level ? 'on' : t.building && i === t.building.target ? 'building' : ''}"></span>`).join('');
      let action;
      if (t.building) {
        const done = 1 - t.building.monthsLeft / t.building.total;
        action = `<div class="stack"><div class="row-between small"><span>Implantando o nível ${t.building.target}</span><b>${t.building.monthsLeft} mês(es)</b></div>${meter(done, 'gold')}</div>`;
      } else if (t.level >= 5) {
        action = chip('gold', 'Nível máximo');
      } else {
        const cost = d.costs[t.level] * s.P;
        const minTI = (t.level + 1) * 2;
        action = `<div class="stack">
          ${kv([
            ['Próximo nível', esc(d.levels[t.level + 1])],
            ['Investimento', money(cost)],
            ['Prazo', `${2 + t.level} meses`],
            ['Manutenção extra', `${money(d.maint * s.P)}/mês`],
            ['Equipe de TI exigida', `${minTI} ${s.staff.ti >= minTI ? '' : `<span class="bad-text">(você tem ${s.staff.ti})</span>`}`],
          ])}
          <button class="btn btn-primary btn-sm" data-act="upgrade:${k}" ${s.staff.ti < minTI ? 'disabled' : ''}>Iniciar projeto</button>
        </div>`;
      }
      return `<section class="panel stack">
        <div class="row-between"><h3 class="panel-title">${esc(d.name)}</h3><div class="pips" aria-label="Nível ${t.level} de 5">${pips}</div></div>
        <p class="small muted">${esc(d.desc)}</p>
        <div class="small">Nível atual: <b>${t.level} · ${esc(d.levels[t.level])}</b></div>
        ${action}
      </section>`;
    }).join('');
    return `
      ${viewTitle('Tecnologia', 'Projetos são pagos à vista, entram no imobilizado e são depreciados ao longo de cerca de seis anos. Cada nível aumenta a manutenção mensal.')}
      <div class="row">${chip(s.staff.ti >= tiReq ? 'ok' : 'bad', `Equipe de TI: ${s.staff.ti} de ${tiReq} necessários`)}<span class="small muted">Custo de servir um cliente: ${money(E().costPerCustomer(s))}/mês</span></div>
      <div class="grid grid-auto">${cards}</div>
    `;
  };

  // ---------------- Relatórios ----------------
  function sumReports(list) {
    const out = { jurosCreditoBy: {}, perdasBy: {} };
    for (const R of list) {
      for (const [k, v] of Object.entries(R)) if (typeof v === 'number') out[k] = (out[k] || 0) + v;
      for (const k of BG.PRODUCT_KEYS) {
        out.jurosCreditoBy[k] = (out.jurosCreditoBy[k] || 0) + ((R.jurosCreditoBy || {})[k] || 0);
      }
    }
    return out;
  }
  function dreTable(R) {
    const line = (label, v, cls = '') => `<tr class="${cls}"><td>${esc(label)}</td><td class="n ${v < 0 ? 'bad-text' : ''}">${money(v)}</td></tr>`;
    const by = R.jurosCreditoBy || {};
    const bruto = (R.jurosCredito || 0) + (R.jurosTitulos || 0) + (R.compulsorio || 0) + (R.resultadoMercado || 0) -
      (R.jurosPoupanca || 0) - (R.jurosCdb || 0) - (R.jurosInterbancario || 0) - (R.perdasCredito || 0);
    const servicos = (R.tarifas || 0) + (R.intercambio || 0);
    const opex = ['pessoal', 'agencias', 'tecnologia', 'servicos', 'marketing', 'administrativas', 'fgc', 'depreciacao', 'outras'].reduce((a, k) => a + (R[k] || 0), 0);
    return `<div class="table-wrap"><table class="ledger"><tbody>
      <tr class="sub"><td>Receitas da intermediação financeira</td><td class="n"></td></tr>
      ${BG.PRODUCT_KEYS.map((k) => line('Juros: ' + BG.PRODUCTS[k].short, by[k] || 0, 'indent')).join('')}
      ${R.jurosEstruturadas ? line('Juros: operações estruturadas', R.jurosEstruturadas, 'indent') : ''}
      ${line('Títulos públicos', R.jurosTitulos || 0, 'indent')}
      ${line('Remuneração do compulsório', R.compulsorio || 0, 'indent')}
      ${R.resultadoMercado ? line('Ações e marcação a mercado', R.resultadoMercado, 'indent') : ''}
      <tr class="sub"><td>Despesas da intermediação financeira</td><td class="n"></td></tr>
      ${line('Juros da poupança', -(R.jurosPoupanca || 0), 'indent')}
      ${line('Juros dos CDBs', -(R.jurosCdb || 0), 'indent')}
      ${line('Interbancário e redesconto', -(R.jurosInterbancario || 0), 'indent')}
      ${line('Perdas com crédito', -(R.perdasCredito || 0), 'indent')}
      ${line('Resultado bruto da intermediação', bruto, 'total')}
      <tr class="sub"><td>Receitas de serviços</td><td class="n">${money(servicos)}</td></tr>
      ${line('Tarifas', R.tarifas || 0, 'indent')}
      ${line('Intercâmbio de cartões', R.intercambio || 0, 'indent')}
      <tr class="sub"><td>Despesas operacionais</td><td class="n bad-text">${money(-opex)}</td></tr>
      ${line('Pessoal', -(R.pessoal || 0), 'indent')}
      ${line('Agências e caixas eletrônicos', -(R.agencias || 0), 'indent')}
      ${line('Tecnologia', -(R.tecnologia || 0), 'indent')}
      ${line('Atendimento a clientes', -(R.servicos || 0), 'indent')}
      ${line('Marketing', -(R.marketing || 0), 'indent')}
      ${line('Administrativas', -(R.administrativas || 0), 'indent')}
      ${line('Contribuição ao FGC', -(R.fgc || 0), 'indent')}
      ${line('Depreciação e amortização', -(R.depreciacao || 0), 'indent')}
      ${line('Outras (eventos, multas, rescisões)', -(R.outras || 0), 'indent')}
      ${line('Resultado antes dos impostos', R.resultadoAntesIR || 0, 'total')}
      ${line('IR e CSLL', -(R.impostos || 0), 'indent')}
      ${line('Lucro líquido', R.lucroLiquido || 0, 'total')}
    </tbody></table></div>`;
  }
  function balanceTable(s, m) {
    const row = (label, v, cls = '') => `<tr class="${cls}"><td>${esc(label)}</td><td class="n">${money(v)}</td></tr>`;
    return `<div class="grid grid-2">
      <div class="table-wrap"><table class="ledger"><thead><tr><th>Ativo</th><th class="n">R$</th></tr></thead><tbody>
        ${row('Caixa', s.cash)}
        ${row('Depósito compulsório no BC', s.compulsory)}
        ${row('Tesouro Selic', s.lft)}
        ${row('Prefixados', s.ltn.value)}
        ${row('Ações', s.stocks)}
        <tr class="sub"><td>Carteira de crédito</td><td class="n">${money(m.loans)}</td></tr>
        ${BG.PRODUCT_KEYS.map((k) => row(BG.PRODUCTS[k].short, s.products[k].balance, 'indent')).join('')}
        ${s.bigLoans.length ? row('Operações estruturadas', U.sum(s.bigLoans, (b) => b.amount), 'indent') : ''}
        ${row('Imobilizado e intangível', s.fixed)}
        ${row('Total do ativo', m.assets, 'total')}
      </tbody></table></div>
      <div class="table-wrap"><table class="ledger"><thead><tr><th>Passivo e patrimônio</th><th class="n">R$</th></tr></thead><tbody>
        ${row('Depósitos à vista', s.deposits.checking)}
        ${row('Poupança', s.deposits.savings)}
        ${row('CDB', s.deposits.cdb)}
        ${row('Interbancário', s.interbank)}
        ${row('Redesconto do BC', s.redesconto)}
        ${row('Total do passivo', m.liabilities, 'sub')}
        ${row('Patrimônio líquido', m.equity, 'sub')}
        ${row('Total do passivo e PL', m.liabilities + m.equity, 'total')}
      </tbody></table></div>
    </div>`;
  }
  function indicatorsTable(s, m) {
    const R12 = sumReports(s.reports);
    const months = Math.max(1, s.reports.length);
    const ann = 12 / months;
    const nii = (R12.margemFinanceira || 0) * ann;
    const fees = ((R12.tarifas || 0) + (R12.intercambio || 0)) * ann;
    const opex = ['pessoal', 'agencias', 'tecnologia', 'servicos', 'marketing', 'administrativas', 'fgc', 'depreciacao', 'outras'].reduce((a, k) => a + (R12[k] || 0), 0) * ann;
    const funding = ((R12.jurosPoupanca || 0) + (R12.jurosCdb || 0)) * ann;
    const rows = [
      ['Índice de Basileia', pct(m.basel), `Patrimônio / ativos ponderados pelo risco. Mínimo ${pct(C.BASEL_MIN)}.`],
      ['Ativos ponderados pelo risco', money(m.rwa), `crédito ${money(m.rwaCredit)} · mercado ${money(m.rwaMarket)} · operacional ${money(m.rwaOp)}`],
      ['ROE (12 meses)', pct(m.roe12), 'Lucro sobre o patrimônio médio.'],
      ['ROA (12 meses)', pct(m.assets > 0 ? (m.ni12 / m.assets) * 100 : 0, 2), 'Lucro sobre os ativos.'],
      ['Margem financeira (NIM)', pct(m.assets > 0 ? (nii / m.assets) * 100 : 0, 2), 'Resultado de juros sobre os ativos, anualizado.'],
      ['Índice de eficiência', pct(nii + fees > 0 ? (opex / (nii + fees)) * 100 : 0), 'Despesas operacionais / receitas. Quanto menor, melhor.'],
      ['Inadimplência (12 meses)', pct(m.npl), 'Calotes sobre a carteira média.'],
      ['Custo de captação', pct(m.deposits > 0 ? (funding / m.deposits) * 100 : 0, 2), 'Juros pagos sobre depósitos, anualizado.'],
      ['Crédito / depósitos', pct(m.ldr, 0), 'Quanto dos depósitos virou empréstimo.'],
      ['Liquidez', pct(m.liquidity), 'Caixa e títulos sobre depósitos.'],
      ['Preço / valor patrimonial', num(m.pb, 2) + '×', 'Quanto o mercado paga por real de patrimônio.'],
      ['Rating', esc(s.rating), 'Revisado todo mês de abril.'],
    ];
    return `<div class="table-wrap"><table class="ledger"><thead><tr><th>Indicador</th><th class="n">Valor</th><th>O que significa</th></tr></thead><tbody>
      ${rows.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td class="n">${b}</td><td class="small muted">${c}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  function historyTable(s) {
    const h = s.history.slice(-36).reverse();
    return `<div class="table-wrap"><table class="ledger"><thead><tr><th>Mês</th><th class="n">Ativos</th><th class="n">Crédito</th><th class="n">Depósitos</th><th class="n">PL</th><th class="n">Lucro</th><th class="n">Clientes</th><th class="n">Basileia</th><th class="n">Inadimpl.</th><th class="n">Selic</th></tr></thead><tbody>
      ${h.map((x) => `<tr><td>${esc(ml(s, x.m))}</td><td class="n">${money(x.assets)}</td><td class="n">${money(x.loans)}</td><td class="n">${money(x.deposits)}</td><td class="n">${money(x.equity)}</td><td class="n ${signed(x.ni)}">${money(x.ni)}</td><td class="n">${num(x.customers)}</td><td class="n">${pct(x.basel)}</td><td class="n">${pct(x.npl)}</td><td class="n">${pct(x.selic, 2)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  VIEWS.relatorios = (s, m) => {
    const tabs = [['dre', 'DRE'], ['balanco', 'Balanço'], ['indicadores', 'Indicadores'], ['historico', 'Histórico']];
    let body = '';
    if (UI.reportTab === 'dre') {
      const periods = [['mes', 'Último mês'], ['12m', 'Últimos 12 meses'], ['ano', 'Ano corrente']];
      let R = null;
      let title = '';
      if (UI.period === 'mes') { R = s.last; title = s.history.length ? mlLong(s, s.history[s.history.length - 1].m) : ''; }
      else if (UI.period === '12m') { R = s.reports.length ? sumReports(s.reports) : null; title = `${s.reports.length} meses`; }
      else {
        // Ano corrente: relatórios mensais cujos meses pertencem ao ano em aberto
        const startM = s.month - (((s.month % 12) + 12) % 12);
        const hs = s.history.slice(-s.reports.length);
        const inYear = s.reports.filter((_, i) => hs[i] && hs[i].m >= startM);
        R = inYear.length ? sumReports(inYear) : null;
        title = `${s.meta.startYear + Math.floor(s.month / 12)}: ${inYear.length} mês(es) fechados`;
      }
      body = `<div class="row-between"><div class="seg" role="group" aria-label="Período">${periods.map(([k, l]) => `<button data-act="period:${k}" aria-pressed="${UI.period === k}">${l}</button>`).join('')}</div><span class="small muted">${esc(title)}</span></div>
        <div style="margin-top:12px">${R ? dreTable(R) : '<p class="muted">Ainda não há dados para este período.</p>'}</div>`;
    } else if (UI.reportTab === 'balanco') {
      body = balanceTable(s, m);
    } else if (UI.reportTab === 'indicadores') {
      body = indicatorsTable(s, m) + `<div style="margin-top:16px">${chartBox('basel', { labels: labels(s, 60), series: [{ name: 'Índice de Basileia', values: series(s, 'basel', 60), color: '--s1' }], format: (v) => pct(v), axisFormat: (v) => pct(v, 0), zero: true, refLine: C.BASEL_MIN, refLabel: 'mínimo regulatório' })}</div>`;
    } else {
      body = historyTable(s);
    }
    return `
      ${viewTitle('Relatórios', 'Demonstrações contábeis e indicadores do banco.')}
      <div class="seg" role="tablist" aria-label="Relatório">${tabs.map(([k, l]) => `<button role="tab" data-act="report:${k}" aria-pressed="${UI.reportTab === k}">${l}</button>`).join('')}</div>
      <section class="panel">${body}</section>
    `;
  };

  // ---------------- Economia ----------------
  const PHASE_TIPS = {
    expansao: 'Emprego e renda crescem. Bom momento para expandir o crédito com política moderada.',
    boom: 'Crédito forte e inflação subindo. O COPOM deve elevar a Selic: prefixados tendem a perder valor.',
    desaceleracao: 'A economia perde fôlego. Considere apertar a política de crédito antes que os calotes subam.',
    recessao: 'Desemprego e calotes em alta, especialmente em capital de giro e crédito pessoal. Preserve capital e liquidez.',
    recuperacao: 'O pior passou. Quem tem capital sobrando cresce mais rápido que os concorrentes nesta fase.',
  };
  VIEWS.economia = (s) => {
    const e = s.eco;
    const cal = (((s.month % 12) + 12) % 12) + 1;
    const next = C.COPOM_MONTHS.find((x) => x >= cal) || C.COPOM_MONTHS[0];
    const n = 60;
    return `
      ${viewTitle('Economia', 'O ciclo econômico muda a demanda por crédito, os calotes e a Selic. Você não controla a economia, só a forma como o banco atravessa cada fase.')}
      <div class="stats">
        ${stat('Fase do ciclo', esc(BG.PHASES[e.phase].name), `há ${e.phaseMonths} meses`)}
        ${stat('Selic', pct(e.selic, 2), `próximo COPOM: ${U.MONTHS[next - 1]}`, { values: series(s, 'selic'), color: '--s1' })}
        ${stat('Inflação (12 meses)', pct(e.inflation), 'meta de 3%', { values: series(s, 'inflation'), color: '--s1' })}
        ${stat('PIB (anualizado)', pct(e.gdp, 1, { plus: true }), 'crescimento', { values: series(s, 'gdp'), color: '--s1' })}
        ${stat('Desemprego', pct(e.unemployment), 'da força de trabalho', { values: series(s, 'unemployment'), color: '--s1' })}
        ${stat('Ibovespa', num(e.stock), `mês ${pct((e.stockReturn || 0) * 100, 1, { plus: true })}`, { values: series(s, 'stock'), color: '--s1' })}
      </div>
      ${panel(`Fase atual: ${BG.PHASES[e.phase].name}`, `<p>${esc(PHASE_TIPS[e.phase])}</p>`)}
      <div class="grid grid-2">
        ${panel('Selic e inflação', chartBox('selic', { labels: labels(s, n), series: [{ name: 'Selic', values: series(s, 'selic', n), color: '--s1' }, { name: 'Inflação', values: series(s, 'inflation', n), color: '--s2' }], format: (v) => pct(v, 2), axisFormat: (v) => pct(v, 0), zero: true }), { sub: '% ao ano' })}
        ${panel('Atividade', chartBox('gdp', { labels: labels(s, n), series: [{ name: 'PIB', values: series(s, 'gdp', n), color: '--s1' }, { name: 'Desemprego', values: series(s, 'unemployment', n), color: '--s2' }], format: (v) => pct(v, 1), axisFormat: (v) => pct(v, 0), zero: true }), { sub: '%' })}
      </div>
      ${panel('Ibovespa', chartBox('ibov', { labels: labels(s, n), series: [{ name: 'Ibovespa', values: series(s, 'stock', n), color: '--s1' }], format: (v) => num(v) + ' pts', axisFormat: U.fmtCompact }, 'short'), { sub: 'pontos' })}
      ${panel('Taxas de referência', kv([
        ['CDI (≈ Selic)', pct(e.selic, 2)],
        ['Poupança', pct(BG.Economy.savingsYield(e.selic), 2)],
        ['Prefixado de 3 anos', pct(e.prefix, 2)],
        ['CDB médio do mercado', `${num(E().cdbMarketPct(s))}% do CDI`],
        ['Interbancário para você', pct(E().interbankRate(s), 2)],
      ]))}
    `;
  };

  // ---------------- Mercado ----------------
  VIEWS.mercado = (s, m) => {
    const rk = E().ranking(s, m);
    return `
      ${viewTitle('Mercado', 'Os concorrentes crescem com a economia. Ultrapasse-os em ativos para subir no ranking.')}
      <div class="stats three">
        ${stat('Sua posição', `${rk.position}º de ${rk.list.length}`, 'por ativos totais')}
        ${stat('Participação de mercado', pct(rk.share, 2), 'dos ativos do setor', { values: series(s, 'share'), color: '--s1' })}
        ${stat('Tamanho do setor', money(rk.total), 'ativos somados')}
      </div>
      ${panel('Ranking', `<div class="table-wrap"><table class="ledger"><thead><tr><th>#</th><th>Banco</th><th>Perfil</th><th class="n">Ativos</th><th class="n">Clientes</th><th class="n">Participação</th></tr></thead><tbody>
        ${rk.list.map((b, i) => `<tr class="${b.player ? 'me' : ''}"><td>${i + 1}</td><td>${esc(b.name)}</td><td>${esc(b.style)}</td><td class="n">${money(b.assets)}</td><td class="n">${num(b.customers)}</td><td class="n">${pct((b.assets / rk.total) * 100, 1)}</td></tr>`).join('')}
      </tbody></table></div>`)}
      ${panel('Sua participação de mercado', chartBox('share', { labels: labels(s, 60), series: [{ name: 'Participação', values: series(s, 'share', 60), color: '--s1' }], format: (v) => pct(v, 2), axisFormat: (v) => pct(v, 1), zero: true }, 'short'), { sub: '% dos ativos do setor' })}
    `;
  };

  // ---------------- Acionistas ----------------
  VIEWS.acionistas = (s, m) => {
    const own = m.ownership * 100;
    const ipo = E().ipoCheck(s);
    const mult = m.scoreReal / s.meta.initialScoreReal;
    const discount = s.shares.listed ? 0.92 : 0.85;
    const issuePrice = m.sharePrice * (s.reputation < 30 || m.ni12 < 0 ? discount - 0.15 : discount);
    return `
      ${viewTitle('Acionistas', 'Sua pontuação é o seu patrimônio pessoal mais o valor da sua participação no banco, em reais de 2027. Emitir ações traz capital mas dilui sua fatia.')}
      <div class="stats">
        ${stat('Sua pontuação', money(m.scoreReal), `${num(mult, 2)}× o valor inicial`, { values: s.history.slice(-36).map((h) => h.score / h.P), color: '--s1' })}
        ${stat('Valor de mercado', money(m.valuation), `${num(m.pb, 2)}× o patrimônio`, { values: series(s, 'valuation'), color: '--s1' })}
        ${stat('Preço por ação', money(m.sharePrice), s.shares.listed ? 'listado em bolsa' : 'avaliação privada (desconto de 20%)')}
        ${stat('Sua participação', pct(own, 1), `${num(s.shares.player)} de ${num(s.shares.total)} ações`)}
        ${stat('Patrimônio pessoal', money(s.wealth), 'rende 85% do CDI')}
        ${stat('Payout', pct(s.payout, 0), 'do lucro anual em dividendos')}
      </div>
      <div class="grid grid-2">
        ${panel('Dividendos', `<div class="stack">
          <div class="field"><span class="label">Payout anual (% do lucro, mínimo legal de 25%)</span>${rateControl('payout', s.payout, 25, 100, 5, 25, '%', 'mínimo')}</div>
          <p class="small muted">Pagos em dezembro sobre o lucro do ano. Você recebe ${pct(own, 1)} de cada real distribuído.</p>
          <div class="divider"></div>
          <div class="field"><span class="label">Dividendo extraordinário</span>${amountField('div', Math.max(0, m.equity * 0.2))}</div>
          <button class="btn btn-sm" data-act="extra-div">Pagar agora</button>
        </div>`)}
        ${panel('Capital', `<div class="stack">
          <div class="field"><span class="label">Emitir novas ações para investidores</span>${amountField('issue', Math.max(0, m.equity))}</div>
          <p class="small muted">Preço de emissão: ${money(issuePrice)} por ação (desconto sobre ${money(m.sharePrice)}).</p>
          <button class="btn btn-sm" data-act="issue">Emitir ações</button>
          <div class="divider"></div>
          <div class="field"><span class="label">Aportar seu patrimônio pessoal</span>${amountField('inject', s.wealth)}</div>
          <button class="btn btn-sm" data-act="inject" ${s.wealth > 0 ? '' : 'disabled'}>Aportar</button>
          ${s.shares.listed ? `<div class="divider"></div><div class="field"><span class="label">Recomprar ações do mercado</span>${amountField('buyback', Math.max(0, m.equity * 0.1))}</div><button class="btn btn-sm" data-act="buyback">Recomprar</button>` : ''}
        </div>`)}
      </div>
      ${!s.shares.listed ? panel('Abertura de capital (IPO)', `<div class="stack">
        <p class="small">Vende 25% do banco em ações novas na bolsa: traz capital, remove o desconto de avaliação privada e dá visibilidade à marca.</p>
        <div class="row">
          ${chip(m.equity >= ipo.minEq ? 'ok' : 'bad', `Patrimônio ${money(ipo.minEq)}`)}
          ${chip(s.reputation >= 50 ? 'ok' : 'bad', 'Reputação 50')}
          ${chip(m.ni12 > 0 && s.history.length >= 12 ? 'ok' : 'bad', 'Lucro em 12 meses')}
          ${chip(s.tech.compliance.level >= 2 ? 'ok' : 'bad', 'Compliance nível 2')}
        </div>
        <button class="btn btn-gold" data-act="ipo" ${ipo.ok ? '' : 'disabled'}>Abrir capital</button>
      </div>`) : ''}
      ${panel('Valor de mercado e patrimônio', chartBox('val', { labels: labels(s, 60), series: [{ name: 'Valor de mercado', values: series(s, 'valuation', 60), color: '--s1' }, { name: 'Patrimônio líquido', values: series(s, 'equity', 60), color: '--s2' }], format: money, axisFormat: U.fmtCompact, zero: true }))}
    `;
  };

  // ---------------- Conquistas ----------------
  VIEWS.conquistas = (s) => {
    const got = Object.keys(s.achievements).length;
    const records = Game().records();
    return `
      ${viewTitle('Conquistas', `${got} de ${BG.ACHIEVEMENTS.length} desbloqueadas.`)}
      <div class="grid grid-auto">
        ${BG.ACHIEVEMENTS.map((a) => {
          const on = s.achievements[a.id] != null;
          return `<div class="ach ${on ? 'on' : 'off'}"><div class="ach-medal" aria-hidden="true">${on ? '★' : '?'}</div><div><div class="ach-name">${esc(a.name)}</div><div class="small muted">${esc(a.desc)}</div>${on ? `<div class="tiny gold-text">${esc(mlLong(s, s.achievements[a.id]))}</div>` : ''}</div></div>`;
        }).join('')}
      </div>
      ${panel('Recordes neste navegador', records.length ? `<div class="table-wrap"><table class="ledger"><thead><tr><th>Banco</th><th>Cenário</th><th>Dificuldade</th><th class="n">Meses</th><th class="n">Pontuação</th><th>Resultado</th></tr></thead><tbody>
        ${records.map((r) => `<tr><td>${esc(r.bank)}</td><td>${esc(r.scenario)}</td><td>${esc(r.difficulty)}</td><td class="n">${num(r.months)}</td><td class="n">${num(r.mult, 2)}×</td><td>${esc(r.grade)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Termine um jogo para registrar seu primeiro recorde.</p>')}
    `;
  };

  // ---------------- Notícias ----------------
  VIEWS.noticias = (s) => {
    const filters = [['all', 'Todas'], ['good', 'Boas'], ['bad', 'Ruins'], ['eco', 'Economia'], ['event', 'Decisões'], ['achievement', 'Conquistas']];
    const items = s.news.filter((n) => UI.newsFilter === 'all' || n.type === UI.newsFilter || (UI.newsFilter === 'bad' && n.type === 'warn')).slice().reverse();
    return `
      ${viewTitle('Notícias', 'Tudo o que aconteceu desde que você assumiu.')}
      <div class="seg" role="group" aria-label="Filtro">${filters.map(([k, l]) => `<button data-act="news:${k}" aria-pressed="${UI.newsFilter === k}">${l}</button>`).join('')}</div>
      <section class="panel">${newsList(s, items)}</section>
    `;
  };

  // ---------------- Ajuda ----------------
  VIEWS.ajuda = () => `
    ${viewTitle('Como jogar', 'Você é o presidente do banco. Cada rodada é um mês: ajuste a estratégia e clique em Fechar mês.')}
    <div class="grid grid-2 help">
      <section class="panel stack"><h3>Objetivo</h3>
        <p>Fazer o banco crescer sem quebrar. Sua pontuação é o seu patrimônio pessoal (dividendos recebidos) mais o valor da sua participação no banco, em reais de 2027. No fim do mandato você recebe uma nota de acordo com quantas vezes multiplicou o valor inicial.</p>
        <p>O jogo acaba antes se o patrimônio líquido ficar negativo, se o Índice de Basileia ficar abaixo de ${pct(C.BASEL_INTERVENTION)} por três meses ou se o banco depender do redesconto do Banco Central por seis meses seguidos.</p>
      </section>
      <section class="panel stack"><h3>Como o banco ganha dinheiro</h3>
        <ul>
          <li><b>Captação:</b> conta corrente (de graça), poupança (taxa regulada) e CDB (você escolhe o % do CDI).</li>
          <li><b>Crédito:</b> empresta a taxas maiores. A diferença é o spread. Calotes comem parte dele.</li>
          <li><b>Tesouraria:</b> o que sobra rende Selic em títulos públicos.</li>
          <li><b>Tarifas e intercâmbio</b> pagam parte dos custos de atendimento.</li>
        </ul>
      </section>
      <section class="panel stack"><h3>Regulação</h3>
        <ul>
          <li><b>Índice de Basileia:</b> patrimônio dividido pelos ativos ponderados pelo risco. Abaixo de ${pct(C.BASEL_MIN)}, o BC restringe concessões e dividendos.</li>
          <li><b>Compulsório:</b> 21% da conta corrente e 20% da poupança ficam presos no Banco Central.</li>
          <li><b>Redesconto:</b> socorro automático quando o caixa fica negativo. Caro e mal visto.</li>
          <li><b>FGC:</b> o banco contribui todo mês com uma fração dos depósitos.</li>
        </ul>
      </section>
      <section class="panel stack"><h3>Clientes</h3>
        <ul>
          <li>Novos clientes vêm do mercado potencial (agências e app), multiplicado pelo reconhecimento da marca e pela atratividade.</li>
          <li>Satisfação depende de atendimento, app, caixas eletrônicos, agências, tarifa e TI.</li>
          <li>Clientes que não tomam crédito costumam dar prejuízo: contrate analistas para atender a demanda.</li>
        </ul>
      </section>
      <section class="panel stack"><h3>Dicas</h3>
        <ul>
          <li>Comece contratando para zerar os alertas de equipe.</li>
          <li>Taxas um pouco abaixo do mercado aumentam muito a demanda em produtos sensíveis, como consignado e imobiliário.</li>
          <li>Política agressiva dá volume rápido, mas os calotes aparecem meses depois.</li>
          <li>Invista no app cedo: ele amplia o mercado e barateia o atendimento.</li>
          <li>Guarde folga de capital antes de recessões. Quem tem capital na recuperação cresce mais.</li>
          <li>Emitir ações com o banco barato dilui muito sua participação.</li>
        </ul>
      </section>
      <section class="panel stack"><h3>Glossário</h3>
        <dl>
          <dt>Selic / CDI</dt><dd>Taxa básica de juros, definida pelo COPOM oito vezes por ano.</dd>
          <dt>Spread</dt><dd>Diferença entre a taxa cobrada e o custo de captação.</dd>
          <dt>PDD</dt><dd>Perdas com crédito: a parte dos calotes que não se recupera.</dd>
          <dt>ROE</dt><dd>Lucro sobre o patrimônio líquido.</dd>
          <dt>P/VPA</dt><dd>Valor de mercado dividido pelo patrimônio.</dd>
          <dt>Payout</dt><dd>Parte do lucro paga como dividendos.</dd>
        </dl>
        <p class="small muted">Atalho: barra de espaço fecha o mês.</p>
      </section>
    </div>`;

  // ======================================================================
  // Renderização principal
  // ======================================================================
  function render() {
    const s = Game().state;
    if (!s) return;
    const m = E().metrics(s);
    const alerts = computeAlerts(s, m);
    const focusKey = document.activeElement && (document.activeElement.getAttribute('data-act') || (document.activeElement.id ? '#' + document.activeElement.id : null));
    renderHeader(s, m);
    renderNav(s, alerts);
    pendingCharts = {};
    pendingSparks = {};
    const view = document.getElementById('view');
    view.innerHTML = (VIEWS[UI.tab] || VIEWS.painel)(s, m, alerts);
    view.setAttribute('aria-label', (TABS.find((t) => t.id === UI.tab) || TABS[0]).label);
    for (const el of document.querySelectorAll('[data-chart]')) BG.Charts.render(el, pendingCharts[el.getAttribute('data-chart')]);
    for (const el of document.querySelectorAll('[data-spark]')) {
      const sp = pendingSparks[el.getAttribute('data-spark')];
      BG.Charts.spark(el, sp.values, sp.color);
    }
    BG.Charts.prune();
    if (focusKey) {
      const el = focusKey.startsWith('#') ? document.getElementById(focusKey.slice(1)) : document.querySelector(`[data-act="${CSS.escape(focusKey)}"]`);
      if (el && !UI.modal) el.focus({ preventScroll: true });
    }
  }

  // ======================================================================
  // Modais
  // ======================================================================
  function openModal(html, opts = {}) {
    const root = document.getElementById('modal-root');
    UI.modal = opts;
    root.innerHTML = `<div class="modal-backdrop" data-backdrop="1"><div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">${html}</div></div>`;
    const first = root.querySelector('[data-autofocus]') || root.querySelector('button:not(:disabled), input, textarea');
    if (first) first.focus();
    Game().pauseAuto();
  }
  function closeModal() {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    const onClose = UI.modal && UI.modal.onClose;
    UI.modal = null;
    if (onClose) onClose();
  }

  function eventModal() {
    const s = Game().state;
    const cur = BG.Events.current(s);
    if (!cur) return;
    const tone = { bad: chip('bad', 'Problema'), good: chip('ok', 'Oportunidade'), neutral: chip('info', 'Decisão') }[cur.tone] || '';
    openModal(`
      <div class="row">${tone}<span class="eyebrow">${esc(mlLong(s, s.month))}</span></div>
      <h2 class="modal-title" id="modal-title">${esc(cur.title)}</h2>
      <p class="modal-text">${esc(cur.text)}</p>
      <div class="choices">${cur.choices.map((c) => `<button class="choice" data-act="choose:${c.index}" ${c.available ? '' : 'disabled'}>
        <span class="choice-label">${esc(c.label)}</span><span class="choice-hint">${esc(c.hint)}${c.available ? '' : ' (indisponível)'}</span>
      </button>`).join('')}</div>
    `, { kind: 'event' });
  }

  function newGameModal(first) {
    const ng = UI.ng;
    const opt = (group, key, title, desc) => `<button class="option-card" data-act="ng:${group}:${key}" aria-pressed="${String(ng[group]) === String(key)}"><b>${esc(title)}</b><span>${esc(desc)}</span></button>`;
    openModal(`
      <div class="eyebrow">${first ? 'Bem-vindo ao Banqueiro S.A.' : 'Novo jogo'}</div>
      <h2 class="modal-title" id="modal-title">Funde o seu banco</h2>
      <p class="modal-text">Você vai presidir um banco mês a mês: definir taxas, contratar, investir em tecnologia, administrar o caixa e enfrentar crises, sem deixar o capital abaixo do mínimo exigido pelo Banco Central.</p>
      <div class="field"><label for="ng-name">Nome do banco</label><input class="input" id="ng-name" data-bind="ng-name" maxlength="40" value="${esc(ng.bankName)}" placeholder="Banco Aurora" data-autofocus></div>
      <div class="field"><span class="label">Cenário</span><div class="option-cards">${Object.entries(BG.SCENARIOS).map(([k, v]) => opt('scenario', k, v.name, v.desc)).join('')}</div></div>
      <div class="field"><span class="label">Dificuldade</span><div class="option-cards">${Object.entries(BG.DIFFICULTY).map(([k, v]) => opt('difficulty', k, v.name, `${v.desc} Capital inicial de ${money(v.equity)}.`)).join('')}</div></div>
      <div class="field"><span class="label">Duração do mandato</span><div class="option-cards">${BG.DURATIONS.map((d) => opt('duration', d.months, d.name, d.months ? `${d.months} meses e nota final.` : 'Jogue enquanto o banco sobreviver.')).join('')}</div></div>
      <div class="btn-row" style="justify-content:flex-end">
        ${first ? '' : '<button class="btn" data-act="modal-close">Cancelar</button>'}
        <button class="btn btn-primary" data-act="ng-start">${first ? 'Começar' : 'Começar novo jogo'}</button>
      </div>
    `, { kind: 'newgame', wide: true, first });
  }

  function gradeFor(mult) {
    return BG.GRADES.find((g) => mult >= g.min) || BG.GRADES[BG.GRADES.length - 1];
  }
  function finalSummary(s, m) {
    const mult = m.scoreReal / s.meta.initialScoreReal;
    const g = gradeFor(s.over ? Math.min(mult, 0.99) : mult);
    return { mult, grade: g.name, html: `
      <div class="grade"><span class="eyebrow">Sua avaliação</span><b>${esc(g.name)}</b><span>${num(mult, 2)}× o valor inicial · ${money(m.scoreReal)} em reais de 2027</span></div>
      ${kv([
        ['Meses no comando', num(s.month)],
        ['Ativos totais', money(m.assets)],
        ['Patrimônio líquido', money(m.equity)],
        ['Clientes', num(s.customers)],
        ['Posição no ranking', `${E().ranking(s, m).position}º`],
        ['Patrimônio pessoal', money(s.wealth)],
        ['Sua participação', pct(m.ownership * 100, 1)],
        ['Conquistas', `${Object.keys(s.achievements).length} de ${BG.ACHIEVEMENTS.length}`],
      ])}` };
  }
  function gameOverModal() {
    const s = Game().state;
    const m = E().metrics(s);
    const reasons = {
      falencia: 'O patrimônio líquido ficou negativo e o Banco Central decretou a liquidação extrajudicial do banco.',
      intervencao: `O Índice de Basileia ficou abaixo de ${pct(C.BASEL_INTERVENTION)} por três meses e o Banco Central assumiu o banco.`,
      liquidez: 'O banco dependeu do redesconto por seis meses seguidos e o Banco Central decretou intervenção.',
    };
    const fs = finalSummary(s, m);
    Game().recordScore(fs.mult, fs.grade);
    openModal(`
      <div class="row">${chip('bad', 'Fim de jogo')}</div>
      <h2 class="modal-title" id="modal-title">O banco quebrou</h2>
      <p class="modal-text">${esc(reasons[s.overReason] || 'O banco foi encerrado.')}</p>
      ${fs.html}
      <div class="btn-row" style="justify-content:flex-end"><button class="btn" data-act="modal-close">Ver relatórios</button><button class="btn btn-primary" data-act="new-game">Novo jogo</button></div>
    `, { kind: 'over' });
  }
  function finishedModal() {
    const s = Game().state;
    const m = E().metrics(s);
    const fs = finalSummary(s, m);
    Game().recordScore(fs.mult, fs.grade);
    openModal(`
      <div class="row">${chip('gold', 'Fim do mandato')}</div>
      <h2 class="modal-title" id="modal-title">${esc(s.meta.bankName)} depois de ${num(s.month / 12)} anos</h2>
      ${fs.html}
      <div class="btn-row" style="justify-content:flex-end"><button class="btn" data-act="continue-endless">Continuar jogando</button><button class="btn btn-primary" data-act="new-game">Novo jogo</button></div>
    `, { kind: 'finished' });
  }
  function annualModal(rep) {
    const s = Game().state;
    const y = rep.ytd;
    const m = rep.m;
    openModal(`
      <div class="eyebrow">Relatório anual</div>
      <h2 class="modal-title" id="modal-title">Balanço de ${rep.year}</h2>
      ${kv([
        ['Lucro líquido do ano', `<span class="${signed(y.lucroLiquido || 0)}">${money(y.lucroLiquido || 0)}</span>`],
        ['Receita total', money(y.receitaTotal || 0)],
        ['Perdas com crédito', money(y.perdasCredito || 0)],
        ['Dividendos pagos', money(y.dividendos || 0)],
        ['ROE', pct(m.roe12)],
        ['Índice de Basileia', pct(m.basel)],
        ['Ativos totais', money(m.assets)],
        ['Clientes', num(s.customers)],
        ['Posição no ranking', `${E().ranking(s, m).position}º`],
      ])}
      <div class="btn-row" style="justify-content:flex-end"><button class="btn btn-primary" data-act="modal-close" data-autofocus>Continuar</button></div>
    `, { kind: 'annual' });
  }
  function exportModal() {
    const code = Game().exportCode();
    openModal(`
      <h2 class="modal-title" id="modal-title">Exportar ou importar</h2>
      <p class="modal-text">Copie o código abaixo para guardar seu jogo ou continuar em outro navegador. Para carregar, cole um código ou escolha um arquivo salvo.</p>
      <div class="field"><label for="export-code">Código do jogo atual</label><textarea class="input" id="export-code" readonly>${esc(code)}</textarea></div>
      <div class="btn-row"><button class="btn btn-sm" data-act="copy-code">Copiar código</button></div>
      <div class="divider"></div>
      <div class="field"><label for="import-code">Carregar jogo</label><textarea class="input" id="import-code" placeholder="Cole aqui um código exportado"></textarea></div>
      <div class="field"><label for="import-file">Ou escolha um arquivo .txt ou .json</label><input class="input" type="file" id="import-file" accept=".txt,.json,text/plain,application/json"></div>
      <div class="btn-row" style="justify-content:flex-end"><button class="btn" data-act="modal-close">Fechar</button><button class="btn btn-primary" data-act="import">Carregar jogo</button></div>
    `, { kind: 'export' });
  }
  function confirmModal(title, text, label, onYes) {
    UI.confirmYes = onYes;
    openModal(`
      <h2 class="modal-title" id="modal-title">${esc(title)}</h2>
      <p class="modal-text">${esc(text)}</p>
      <div class="btn-row" style="justify-content:flex-end"><button class="btn" data-act="modal-close" data-autofocus>Cancelar</button><button class="btn btn-primary" data-act="confirm-yes">${esc(label)}</button></div>
    `, { kind: 'confirm' });
  }

  // ======================================================================
  // Notificações
  // ======================================================================
  function toast(text, type = 'info', ttl = 4500) {
    if (!text) return;
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    const icon = { good: '✓', bad: '✕', warn: '!', achievement: '★', info: 'i', eco: '%', event: '!' }[type] || 'i';
    const i = document.createElement('span');
    i.className = 't-icon';
    i.textContent = icon;
    const t = document.createElement('span');
    t.textContent = text;
    el.append(i, t);
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.remove(), ttl);
  }

  // ======================================================================
  // Eventos de interface
  // ======================================================================
  function amountOf(key) {
    const v = Number(UI.amounts[key]);
    return isFinite(v) ? v : 0;
  }

  function onClick(ev) {
    const t = ev.target.closest('[data-act]');
    if (!t) {
      if (ev.target.getAttribute && ev.target.getAttribute('data-backdrop') && UI.modal && ['annual', 'export', 'confirm'].includes(UI.modal.kind)) closeModal();
      if (UI.menuOpen && !ev.target.closest('.menu-anchor')) { UI.menuOpen = false; render(); }
      return;
    }
    if (t.disabled) return;
    const act = t.getAttribute('data-act');
    const [a, b, c] = act.split(':');
    const g = Game();
    const s = g.state;
    if (a !== 'menu' && UI.menuOpen) UI.menuOpen = false;
    switch (a) {
      case 'tab': UI.tab = b; g.savePrefs({ tab: b }); render(); document.getElementById('main').scrollTop = 0; break;
      case 'menu': UI.menuOpen = !UI.menuOpen; render(); break;
      case 'close-month': g.closeMonth(); break;
      case 'toggle-auto': g.toggleAuto(); break;
      case 'open-event': eventModal(); break;
      case 'choose': g.resolveEvent(Number(b)); break;
      case 'policy': g.act('setPolicy', b, c); break;
      case 'hire': g.act('hire', b, Number(c)); break;
      case 'fire':
        if (Number(c) >= 10) confirmModal('Desligar funcionários', `Desligar ${c} pessoas de ${BG.ROLES[b].name} custa ${money(E().salary(s, b) * 2 * Number(c))} em rescisões.`, 'Desligar', () => g.act('fire', b, Number(c)));
        else g.act('fire', b, Number(c));
        break;
      case 'open-branch': g.act('openBranch'); break;
      case 'close-branch': confirmModal('Fechar agência', 'Você recupera 30% do investimento e cerca de 15% dos clientes da agência encerram a conta.', 'Fechar agência', () => g.act('closeBranch')); break;
      case 'atm': Number(b) > 0 ? g.act('buyAtm', Number(b)) : g.act('sellAtm', -Number(b)); break;
      case 'upgrade': g.act('startUpgrade', b); break;
      case 'campaign': g.act('runCampaign', b); break;
      case 'fill': UI.amounts[b] = Number(c); render(); break;
      case 'trade': g.act('trade', b, c === 'buy' ? amountOf(b) : -amountOf(b)); break;
      case 'borrow': g.act('borrow', amountOf('ib')); break;
      case 'repay': g.act('repay', amountOf('ib')); break;
      case 'extra-div': g.act('extraDividend', amountOf('div')); break;
      case 'issue': g.act('issueShares', amountOf('issue')); break;
      case 'inject': g.act('injectCapital', amountOf('inject')); break;
      case 'buyback': g.act('buyback', amountOf('buyback')); break;
      case 'ipo': confirmModal('Abrir capital', 'O banco vai emitir 25% de ações novas na bolsa. Sua participação será diluída na mesma proporção.', 'Abrir capital', () => g.act('ipo')); break;
      case 'fire-exec': g.act('fireExecutive', Number(b)); break;
      case 'report': UI.reportTab = b; render(); break;
      case 'period': UI.period = b; render(); break;
      case 'news': UI.newsFilter = b; render(); break;
      case 'new-game': closeModalSilently(); UI.ng.bankName = ''; newGameModal(false); break;
      case 'ng': UI.ng[b] = b === 'duration' ? Number(c) : c; refreshNewGame(); break;
      case 'ng-start': {
        const name = (document.getElementById('ng-name').value || '').trim() || 'Banco Aurora';
        closeModalSilently();
        g.newGame({ bankName: name, scenario: UI.ng.scenario, difficulty: UI.ng.difficulty, duration: UI.ng.duration });
        break;
      }
      case 'modal-close': closeModal(); break;
      case 'confirm-yes': { const fn = UI.confirmYes; closeModalSilently(); if (fn) fn(); break; }
      case 'continue-endless': s.meta.duration = 0; closeModal(); g.save(); render(); break;
      case 'save-now': g.save(true); render(); break;
      case 'export': render(); exportModal(); break;
      case 'copy-code': copyCode(); break;
      case 'import': doImport(); break;
      case 'theme': g.setTheme(b); render(); break;
      default: break;
    }
  }
  function closeModalSilently() {
    document.getElementById('modal-root').innerHTML = '';
    UI.modal = null;
  }
  function refreshNewGame() {
    const name = document.getElementById('ng-name');
    if (name) UI.ng.bankName = name.value;
    newGameModal(!!(UI.modal && UI.modal.first));
  }
  function copyCode() {
    const ta = document.getElementById('export-code');
    const text = ta.value;
    const fallback = () => { ta.focus(); ta.select(); toast('Selecione e copie o código com Ctrl+C.', 'info'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => toast('Código copiado.', 'good'), fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }
  function doImport() {
    const ta = document.getElementById('import-code');
    const file = document.getElementById('import-file');
    const finish = (text) => {
      const r = Game().importCode(text);
      if (r.ok) { closeModal(); toast('Jogo carregado.', 'good'); }
      else toast(r.msg, 'bad');
    };
    if (file && file.files && file.files[0]) {
      const reader = new FileReader();
      reader.onload = () => finish(String(reader.result || ''));
      reader.onerror = () => toast('Não foi possível ler o arquivo.', 'bad');
      reader.readAsText(file.files[0]);
    } else if (ta && ta.value.trim()) finish(ta.value.trim());
    else toast('Cole um código ou escolha um arquivo.', 'bad');
  }

  // Controles deslizantes e campos
  function bindKey(el) { return el.getAttribute('data-bind'); }
  function onInput(ev) {
    const el = ev.target;
    const key = bindKey(el);
    if (!key) return;
    if (key.startsWith('amount:')) { UI.amounts[key.slice(7)] = el.value; return; }
    if (key === 'ng-name') { UI.ng.bankName = el.value; return; }
    // Espelha o valor entre o controle deslizante e o campo numérico
    const pair = el.type === 'range' ? document.getElementById('n-' + key) : document.getElementById('r-' + key);
    if (pair && pair !== el) pair.value = el.value;
  }
  function onChange(ev) {
    const el = ev.target;
    const key = bindKey(el);
    if (!key) return;
    const g = Game();
    const v = el.type === 'checkbox' ? el.checked : el.value;
    if (key.startsWith('amount:') || key === 'ng-name') return;
    if (key === 'speed') { g.setSpeed(Number(v)); return; }
    if (key.startsWith('rate:')) g.act('setRate', key.slice(5), Number(v));
    else if (key === 'fee') g.act('setFee', Number(v));
    else if (key === 'cdb') g.act('setCdbPct', Number(v));
    else if (key === 'mincash') g.act('setTreasury', { minCashPct: Number(v) });
    else if (key === 'auto') g.act('setTreasury', { auto: !!v });
    else if (key === 'marketing') g.act('setMarketing', Number(v));
    else if (key === 'payout') g.act('setPayout', Number(v));
  }
  function onKey(ev) {
    if (ev.key === 'Escape') {
      if (UI.menuOpen) { UI.menuOpen = false; render(); return; }
      if (UI.modal && ['annual', 'export', 'confirm'].includes(UI.modal.kind)) closeModal();
      return;
    }
    const tag = (ev.target.tagName || '').toLowerCase();
    if (UI.modal || ['input', 'textarea', 'select', 'button'].includes(tag)) return;
    if (ev.code === 'Space') {
      ev.preventDefault();
      Game().closeMonth();
    }
  }

  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawGuilloche, 120); });
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const fn = () => { BG.Charts.redrawAll(); drawGuilloche(); render(); };
      if (mq.addEventListener) mq.addEventListener('change', fn);
    }
  }

  BG.UI = Object.assign(UI, {
    init, render, toast, openModal, closeModal, eventModal, newGameModal, gameOverModal, finishedModal, annualModal, TABS,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
