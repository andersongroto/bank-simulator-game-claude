/* Motor de simulação: estado do banco, fechamento mensal, métricas e ações do jogador.
   Não depende do DOM: roda no navegador e no Node (testes). */
(function (G) {
  'use strict';
  const BG = (G.BankGame = G.BankGame || {});
  const U = BG.U;
  const C = BG.CONFIG;
  const { clamp, randn, chance } = U;

  // ======================================================================
  // Modificadores temporários (efeitos de eventos)
  // ======================================================================
  function addModifier(s, mod) {
    if (mod.id) s.modifiers = s.modifiers.filter((m) => m.id !== mod.id);
    s.modifiers.push(Object.assign({}, mod));
  }
  function matches(m, kind, product) {
    return m.kind === kind && (!m.product || m.product === 'all' || m.product === product);
  }
  function modMult(s, kind, product) {
    let v = 1;
    for (const m of s.modifiers) if (matches(m, kind, product)) v *= m.value;
    return v;
  }
  function modAdd(s, kind, product) {
    let v = 0;
    for (const m of s.modifiers) if (matches(m, kind, product)) v += m.value;
    return v;
  }

  // ======================================================================
  // Fórmulas de apoio (também usadas pela interface para explicar números)
  // ======================================================================
  const lvl = (s, k) => s.tech[k].level;
  const calMonth = (m) => (((m % 12) + 12) % 12) + 1;
  const totalDeposits = (s) => s.deposits.checking + s.deposits.savings + s.deposits.cdb;
  const totalLoans = (s) => U.sum(BG.PRODUCT_KEYS, (k) => s.products[k].balance) + U.sum(s.bigLoans, (b) => b.amount);
  const salary = (s, role) => BG.ROLES[role].salary * s.salaryIndex;

  function marketRate(s, key) {
    const p = BG.PRODUCTS[key];
    return s.eco.selic + p.spread * modMult(s, 'marketSpread', key);
  }
  function rateCap(s, key) {
    for (const m of s.modifiers) if (m.kind === 'rateCap' && m.product === key) return s.eco.selic + m.value;
    return null;
  }
  function cdbMarketPct(s) {
    return 100 + modAdd(s, 'cdbMarket') * 100;
  }
  function cdbFactor(s) {
    return clamp(Math.exp(7 * (s.cdbPct - cdbMarketPct(s)) / 100), 0.25, 2.5);
  }
  function ratingIndex(s) {
    return BG.RATINGS.indexOf(s.rating);
  }
  function interbankRate(s) {
    return s.eco.selic + Math.max(0.3, C.INTERBANK_SPREAD + (3 - ratingIndex(s)) * 0.6);
  }
  function brokerTarget(s, equity) {
    const mkt = cdbMarketPct(s) / 100;
    const k = clamp((s.cdbPct / 100 - mkt - 0.02) / 0.2, 0, 1.25);
    return Math.max(0, equity) * 3 * k * (0.5 + s.reputation / 100) * (0.6 + 0.15 * ratingIndex(s));
  }
  function idealAttendants(s) {
    const per = 300 * (1 + 0.5 * lvl(s, 'app')) * (s.branches === 0 ? 2 : 1);
    return s.customers / per;
  }
  function idealManagers(s) {
    const per = 900 * (1 + 0.5 * lvl(s, 'app')) * (s.branches === 0 ? 2 : 1);
    return s.customers / per;
  }
  function requiredTI(s) {
    const raw = 2 + lvl(s, 'app') * 2 + lvl(s, 'seguranca') + s.customers / 8000;
    return Math.ceil(raw * (1 - 0.1 * lvl(s, 'core')));
  }
  function analystCapacity(s) {
    return s.staff.analistas * C.ANALYST_CAPACITY * s.P * (1 + 0.1 * lvl(s, 'credito'));
  }
  function salesFactor(s) {
    const r = s.staff.gerentes / Math.max(1, idealManagers(s));
    return clamp(0.5 + 0.5 * r, 0.5, 1.15);
  }
  // Custo mensal de servir um cliente: cai com digitalização e sem agências físicas
  function costPerCustomer(s) {
    return C.COST_PER_CUSTOMER * s.P * (1 - 0.08 * lvl(s, 'core')) * (1 - 0.1 * lvl(s, 'app')) * (s.branches === 0 ? 0.6 : 1);
  }
  function digitalReach(s) {
    return C.DIGITAL_REACH[lvl(s, 'app')];
  }
  function addressable(s) {
    return s.branches * C.BRANCH.reach + digitalReach(s) + C.HQ_REACH;
  }

  function satisfactionBreakdown(s) {
    const app = lvl(s, 'app');
    const parts = [];
    const atRatio = s.staff.atendimento / Math.max(1, idealAttendants(s));
    parts.push({ label: 'Atendimento', value: clamp(25 * (Math.min(atRatio, 1.3) - 1), -25, 7) });
    parts.push({ label: 'Qualidade do app', value: 3 * app });
    if (s.branches > 0) {
      const atmIdeal = s.customers / (C.ATM.custPer * (1 + 0.5 * app));
      const r = s.atms / Math.max(1, atmIdeal);
      parts.push({ label: 'Caixas eletrônicos', value: clamp(6 * (Math.min(r, 1.2) - 1), -6, 1.2) });
      const cpb = s.customers / s.branches;
      const v = cpb > C.BRANCH.custIdeal ? -Math.min(8, (cpb - C.BRANCH.custIdeal) / 4000) * (1 - app / 6) : 2;
      parts.push({ label: 'Agências', value: v });
    } else {
      parts.push({ label: 'Sem agências', value: app >= 2 ? 0 : -8 });
    }
    parts.push({ label: 'Tarifa mensal', value: clamp(-0.35 * (s.fee / s.P - C.MARKET_FEE), -12, 7) });
    const tiReq = requiredTI(s);
    if (s.staff.ti < tiReq) parts.push({ label: 'Equipe de TI insuficiente', value: -15 * (1 - s.staff.ti / tiReq) });
    const mod = modAdd(s, 'satisfaction');
    if (mod) parts.push({ label: 'Eventos recentes', value: mod });
    const total = clamp(60 + U.sum(parts, (p) => p.value), 5, 98);
    return { base: 60, parts, total };
  }

  function reputationBreakdown(s, m) {
    const parts = [];
    parts.push({ label: 'Satisfação dos clientes', value: 0.25 * (s.satisfaction - 60) });
    let cap = 0;
    if (m.basel >= 16) cap = 6;
    else if (m.basel >= 12.5) cap = 3;
    else if (m.basel < C.BASEL_MIN) cap = -12;
    parts.push({ label: 'Solidez de capital', value: cap });
    if (s.history.length >= 6) parts.push({ label: 'Lucratividade', value: m.ni12 > 0 ? 5 : -8 });
    parts.push({ label: 'Governança', value: 2.5 * lvl(s, 'compliance') });
    parts.push({ label: 'Porte do banco', value: clamp(4 * Math.log10(Math.max(1, m.assets / s.P) / 1e8), 0, 15) });
    parts.push({ label: 'Rating ' + s.rating, value: (ratingIndex(s) - 3) * 1.5 });
    if (s.redesconto > 0) parts.push({ label: 'Socorro do Banco Central', value: -10 });
    const mod = modAdd(s, 'reputation');
    if (mod) parts.push({ label: 'Eventos recentes', value: mod });
    const total = clamp(45 + U.sum(parts, (p) => p.value), 2, 98);
    return { base: 45, parts, total };
  }

  function acquisitionInfo(s) {
    const pool = Math.max(0, addressable(s) - s.customers);
    const feeF = Math.exp(-0.025 * (s.fee / s.P - C.MARKET_FEE));
    const cdbF = Math.pow(cdbFactor(s), 0.25);
    const satF = clamp(Math.pow(s.satisfaction / 65, 2), 0.1, 2);
    const repF = 0.4 + (1.2 * s.reputation) / 100;
    const mod = modMult(s, 'acquisition');
    const A = feeF * cdbF * satF * repF * mod;
    const newCust = pool * C.ACQ_BASE * s.awareness * A;
    const churnRate = Math.max(0.001,
      0.003 + 0.04 * Math.pow(1 - s.satisfaction / 100, 3) + 0.0002 * Math.max(0, s.fee / s.P - C.MARKET_FEE) + modAdd(s, 'churn'));
    return { addressable: addressable(s), pool, attractiveness: A, feeF, cdbF, satF, repF, mod, newCust, churnRate, churn: s.customers * churnRate };
  }

  function econDemand(s, key) {
    const p = BG.PRODUCTS[key];
    const e = s.eco;
    return clamp(1 + p.gdpSens * (e.gdp - 2) - p.selicSens * (e.selic - 10), 0.3, 1.8);
  }
  function econDefault(s, key) {
    const p = BG.PRODUCTS[key];
    const e = s.eco;
    return clamp(1 + p.unempSens * 0.12 * (e.unemployment - 8.5) - 0.03 * p.unempSens * (e.gdp - 2), 0.5, 3.5);
  }
  function rateDemand(s, key) {
    const p = BG.PRODUCTS[key];
    const r = s.products[key].rate / marketRate(s, key);
    return clamp(Math.exp(-p.elasticity * (r - 1)), 0.05, 3);
  }
  function adverseSelection(s, key) {
    const r = s.products[key].rate / marketRate(s, key);
    return 1 + 0.5 * Math.max(0, r - 1.15);
  }
  function approvalRate(s, key) {
    const pol = BG.POLICIES[s.products[key].policy];
    return Math.min(0.98, pol.approval * (1 + 0.03 * lvl(s, 'credito')));
  }
  function newLoanRisk(s, key) {
    const pol = BG.POLICIES[s.products[key].policy];
    return pol.risk * (1 - 0.07 * lvl(s, 'credito')) * adverseSelection(s, key) * modMult(s, 'newRisk', key) * execBonus(s, 'risk');
  }
  function seasonal(key, cal) {
    if (key !== 'cartao') return 1;
    return cal === 12 ? 1.3 : cal === 11 ? 1.12 : cal === 1 ? 0.92 : 1;
  }
  function loanDemand(s, key, cal) {
    const p = BG.PRODUCTS[key];
    const pol = BG.POLICIES[s.products[key].policy];
    if (pol.approval === 0) return 0;
    return s.customers * p.demand * s.profile.loan * s.P * econDemand(s, key) * rateDemand(s, key) *
      approvalRate(s, key) * salesFactor(s) * modMult(s, 'demand', key) * seasonal(key, cal) * execBonus(s, 'demand');
  }
  function monthlyDefaultRate(s, key) {
    const p = BG.PRODUCTS[key];
    return (p.default / 100 / 12) * econDefault(s, key) * s.products[key].risk * modMult(s, 'default', key);
  }
  function execBonus(s, kind) {
    let v = 1;
    for (const ex of s.executives) if (ex.effect === kind) v *= ex.value;
    return v;
  }

  // ======================================================================
  // Métricas derivadas do estado
  // ======================================================================
  function metrics(s) {
    const loans = totalLoans(s);
    const deposits = totalDeposits(s);
    const assets = s.cash + s.compulsory + s.lft + s.ltn.value + s.stocks + loans + s.fixed;
    const liabilities = deposits + s.interbank + s.redesconto;
    const equity = assets - liabilities;
    let rwaCredit = 0;
    for (const k of BG.PRODUCT_KEYS) rwaCredit += s.products[k].balance * BG.PRODUCTS[k].rw;
    rwaCredit += U.sum(s.bigLoans, (b) => b.amount);
    const rwaMarket = s.stocks * C.STOCK_RW + s.ltn.value * 0.1;
    const rwaOp = 22.5 * Math.max(0, s.grossEMA);
    const rwa = rwaCredit + rwaMarket + s.fixed + rwaOp;
    const basel = rwa > 0 ? (equity / rwa) * 100 : 999;
    const liquid = s.cash + s.lft + s.ltn.value;
    const h = s.history;
    const last12 = h.slice(-12);
    const ni12 = U.sum(last12, (x) => x.ni);
    const defaults12 = U.sum(last12, (x) => x.defaults);
    const avgLoans = last12.length ? U.sum(last12, (x) => x.loans) / last12.length : loans;
    const npl = avgLoans > 0 ? (defaults12 / avgLoans) * 100 * (12 / Math.max(1, last12.length)) : 0;
    const avgEq = last12.length ? U.sum(last12, (x) => x.equity) / last12.length : equity;
    const roe12 = avgEq > 0 ? (ni12 / avgEq) * 100 * (12 / Math.max(1, last12.length)) : 0;
    const m = {
      loans, deposits, assets, liabilities, equity, rwa, rwaCredit, rwaMarket, rwaOp, basel, liquid,
      liquidity: deposits > 0 ? (liquid / deposits) * 100 : 100,
      ldr: deposits > 0 ? (loans / deposits) * 100 : 0,
      ni12, npl, roe12,
    };
    const v = valuation(s, m);
    m.pb = v.pb;
    m.valuation = v.value;
    m.sharePrice = v.value / s.shares.total;
    m.ownership = s.shares.player / s.shares.total;
    m.stake = m.ownership * m.valuation;
    m.score = s.wealth + m.stake;
    m.scoreReal = m.score / s.P;
    m.interbankLimit = Math.max(0, equity) * (0.5 + 0.25 * ratingIndex(s));
    return m;
  }

  function valuation(s, m) {
    const h = s.history;
    let growth = 0;
    if (h.length >= 12) {
      const old = h[h.length - 12].customers;
      growth = old > 0 ? s.customers / old - 1 : 0;
    }
    let pb = 0.7 + 5 * (m.roe12 / 100) + (0.4 * (s.reputation - 50)) / 50 + clamp(growth * 1.5, -0.3, 0.6) + 0.04 * lvl(s, 'compliance');
    if (m.basel < C.BASEL_MIN) pb -= 0.3;
    pb = clamp(pb, 0.3, 4);
    const hist = s.eco.stockHist;
    const avg = U.sum(hist) / hist.length;
    const sentiment = Math.pow(s.eco.stock / avg, 0.8);
    const listedF = s.shares.listed ? 1 : 0.8;
    const value = m.equity > 0 ? m.equity * pb * sentiment * listedF : Math.max(0, s.shares.total * 0.01);
    return { pb: pb * sentiment * listedF, value };
  }

  // ======================================================================
  // Novo jogo
  // ======================================================================
  function newGame(opts = {}) {
    const scKey = BG.SCENARIOS[opts.scenario] ? opts.scenario : 'regional';
    const dfKey = BG.DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal';
    const sc = BG.SCENARIOS[scKey];
    const df = BG.DIFFICULTY[dfKey];
    const seed = (opts.seed != null ? opts.seed : Math.floor(Math.random() * 4294967296)) >>> 0;
    const duration = opts.duration != null ? opts.duration : 240;

    const s = {
      v: 1,
      meta: {
        bankName: (opts.bankName || 'Banco Aurora').slice(0, 40),
        scenario: scKey, difficulty: dfKey, duration, seed, startYear: C.START_YEAR,
      },
      rng: { s: seed },
      month: -12,
      P: 1,
      eco: BG.Economy.newEconomy(),
      over: false, overReason: null, finished: false,
      customers: sc.customers,
      satisfaction: sc.satisfaction,
      reputation: sc.reputation,
      awareness: sc.awareness,
      profile: Object.assign({ loan: sc.loansMult }, sc.profile),
      fee: sc.fee,
      cdbPct: sc.cdbPct,
      products: {},
      bigLoans: [],
      deposits: {},
      cash: 0, compulsory: 0, lft: 0, ltn: { value: 0, rate: 0 }, stocks: 0, fixed: 0,
      interbank: 0, redesconto: 0,
      staff: Object.assign({}, sc.staff),
      salaryIndex: 1,
      executives: [],
      branches: sc.branches,
      atms: sc.atms,
      tech: {},
      marketing: sc.marketing,
      treasury: { minCashPct: 8, auto: true },
      payout: 25,
      shares: { total: C.INITIAL_SHARES, player: C.INITIAL_SHARES, listed: false },
      wealth: 0,
      taxLoss: 0,
      rating: 'BBB',
      grossEMA: 0,
      modifiers: [],
      flags: { cooldowns: {}, campaigns: {}, lastRaise: -99, annualReport: null },
      counters: { baselStrong: 0, baselCritical: 0, redesconto: 0, profitableYears: 0, recession: null },
      competitors: BG.COMPETITORS.map((c) => Object.assign({}, c)),
      pendingEvent: null,
      news: [],
      history: [],
      achievements: {},
      acc: emptyAcc(),
      ytd: {},
      last: null,
      reports: [],
    };
    for (const k of BG.TECH_KEYS) s.tech[k] = { level: sc.tech[k] || 0, building: null };

    // Carteira inicial em equilíbrio com a demanda
    for (const k of BG.PRODUCT_KEYS) {
      const p = BG.PRODUCTS[k];
      const rate = Math.round((s.eco.selic + p.spread) * 10) / 10;
      const balance = s.customers * p.demand * p.maturity * 0.75 * sc.loansMult;
      s.products[k] = { rate, policy: 'moderada', balance, avgRate: rate, risk: sc.badPortfolio ? 1.9 : 1 };
    }
    s.deposits.checking = s.customers * s.profile.checking;
    s.deposits.savings = s.customers * s.profile.savings;
    s.deposits.cdb = s.customers * s.profile.cdb * cdbFactor(s);
    const dep = totalDeposits(s);
    s.compulsory = requiredCompulsory(s);
    s.fixed = s.branches * C.BRANCH.book + s.atms * C.ATM.book + 2000000;
    s.cash = dep * 0.08;
    const equity = sc.equityFixed ? sc.equityFixed * df.rescue : df.equity * sc.equityMult;
    const uses = s.compulsory + totalLoans(s) + s.fixed + s.cash;
    const gap = equity + dep - uses;
    if (gap >= 0) s.lft = gap;
    else s.interbank = -gap;
    if (sc.badPortfolio) {
      addModifier(s, { id: 'carteira-podre', kind: 'default', product: 'all', value: 1.35, months: 18, label: 'Carteira herdada de má qualidade' });
    }
    s.grossEMA = estimateGrossIncome(s);

    // Um ano de história antes de você assumir (sem eventos)
    for (let i = 0; i < 12; i++) simulateMonth(s, { warmup: true });
    s.ytd = {};
    s.news = [];
    s.acc = emptyAcc();
    s.counters.recession = null;
    const m0 = metrics(s);
    s.meta.initialScoreReal = m0.scoreReal;
    s.meta.initialEquity = m0.equity;
    s.news.push({ m: s.month, type: 'info', text: `Você assumiu o comando do ${s.meta.bankName}. Boa sorte!` });
    return s;
  }

  function emptyAcc() {
    return { pessoal: 0, marketing: 0, outras: 0, mercado: 0, capital: 0, dividends: 0, items: [] };
  }

  function estimateGrossIncome(s) {
    let v = 0;
    for (const k of BG.PRODUCT_KEYS) v += (s.products[k].balance * s.products[k].avgRate) / 1200;
    v += (s.lft * s.eco.selic) / 1200;
    v -= (s.deposits.savings * BG.Economy.savingsYield(s.eco.selic)) / 1200;
    v -= (s.deposits.cdb * s.eco.selic * (s.cdbPct / 100)) / 1200;
    v += s.customers * (s.fee + C.SERVICE_FEE_PER_CUSTOMER);
    return Math.max(0, v);
  }

  function requiredCompulsory(s) {
    const extra = modAdd(s, 'compulsory');
    return s.deposits.checking * Math.max(0, C.COMPULSORY.checking + extra) +
      s.deposits.savings * C.COMPULSORY.savings + s.deposits.cdb * C.COMPULSORY.cdb;
  }

  // ======================================================================
  // Liquidez: garante caixa não negativo vendendo ativos ou tomando redesconto
  // ======================================================================
  // noCost: usa só Tesouro Selic e redesconto (sem custos que afetariam o resultado já fechado)
  function ensureLiquidity(s, R, target = 0, noCost = false) {
    let need = target - s.cash;
    if (need <= 0) return;
    const fromLft = Math.min(s.lft, need);
    s.lft -= fromLft; s.cash += fromLft; need -= fromLft;
    if (need > 0 && s.ltn.value > 0 && !noCost) {
      const sell = Math.min(s.ltn.value, need / 0.997);
      s.ltn.value -= sell;
      s.cash += sell * 0.997;
      addCost(s, R, 'mercado', sell * 0.003);
      need = target - s.cash;
    }
    if (need > 0 && s.stocks > 0 && !noCost) {
      const sell = Math.min(s.stocks, need / 0.99);
      s.stocks -= sell;
      s.cash += sell * 0.99;
      addCost(s, R, 'mercado', sell * 0.01);
      need = target - s.cash;
    }
    if (need > 0) {
      s.redesconto += need;
      s.cash += need;
    }
  }
  function addCost(s, R, cat, amount) {
    if (R) {
      if (cat === 'mercado') R.resultadoMercado -= amount;
      else R.outras += amount;
    } else {
      s.acc[cat] += amount;
    }
  }

  // ======================================================================
  // Fechamento do mês
  // ======================================================================
  function newReport() {
    return {
      jurosCredito: 0, jurosCreditoBy: {}, jurosEstruturadas: 0, jurosTitulos: 0, resultadoMercado: 0, compulsorio: 0,
      tarifas: 0, intercambio: 0,
      jurosPoupanca: 0, jurosCdb: 0, jurosInterbancario: 0,
      perdasCredito: 0, perdasBy: {}, defaultsBy: {},
      pessoal: 0, agencias: 0, tecnologia: 0, servicos: 0, marketing: 0, administrativas: 0, fgc: 0, depreciacao: 0, outras: 0,
      receitaTotal: 0, despesaTotal: 0, resultadoAntesIR: 0, impostos: 0, lucroLiquido: 0, dividendos: 0, capital: 0,
      originacao: {}, demanda: {}, originacaoTotal: 0, demandaTotal: 0, limites: [],
      novosClientes: 0, clientesPerdidos: 0, defaults: 0, margemFinanceira: 0, items: [],
    };
  }

  function simulateMonth(s, opts = {}) {
    if (s.over || s.pendingEvent) return null;
    const warm = !!opts.warmup;
    const cal = calMonth(s.month);
    const R = newReport();
    const news = [];
    const startMetrics = metrics(s);
    const pushNews = (type, text) => news.push({ type, text });

    // 1) Economia
    for (const n of BG.Economy.step(s)) news.push(n);
    const e = s.eco;
    const P = s.P;

    // 2) Projetos de tecnologia
    for (const k of BG.TECH_KEYS) {
      const t = s.tech[k];
      if (t.building) {
        t.building.monthsLeft--;
        if (t.building.monthsLeft <= 0) {
          t.level = t.building.target;
          t.building = null;
          pushNews('good', `${BG.TECH[k].name} chegou ao nível ${t.level}: ${BG.TECH[k].levels[t.level]}.`);
        }
      }
    }
    // Teto de juros regulatório
    for (const k of BG.PRODUCT_KEYS) {
      const cap = rateCap(s, k);
      if (cap != null && s.products[k].rate > cap) s.products[k].rate = Math.floor(cap * 10) / 10;
    }

    // 3) Clientes, satisfação e marca
    const satT = satisfactionBreakdown(s).total;
    s.satisfaction += (satT - s.satisfaction) * 0.2;
    const mkt = s.marketing / P;
    s.awareness += 0.035 * Math.log(1 + mkt / 150000) * (1 - s.awareness) - 0.015 * s.awareness;
    s.awareness = clamp(s.awareness, 0.02, 0.97);
    const acq = acquisitionInfo(s);
    R.novosClientes = acq.newCust;
    R.clientesPerdidos = acq.churn;
    s.customers = Math.max(100, s.customers + acq.newCust - acq.churn);

    // 4) Captação: juros creditados e fluxos
    const d = s.deposits;
    const savY = BG.Economy.savingsYield(e.selic);
    R.jurosPoupanca = (d.savings * savY) / 1200;
    R.jurosCdb = (d.cdb * e.selic * (s.cdbPct / 100)) / 1200;
    d.savings += R.jurosPoupanca;
    d.cdb += R.jurosCdb;
    const econDep = 1 + 0.02 * (e.gdp - 2);
    const tChk = s.customers * s.profile.checking * P * econDep;
    const savFactor = clamp((1.2 * savY) / Math.max(1, e.selic * 0.85), 0.5, 1.4);
    const tSav = s.customers * s.profile.savings * P * savFactor;
    const broker = brokerTarget(s, startMetrics.equity);
    const tCdb = s.customers * s.profile.cdb * P * cdbFactor(s) + broker;
    const fChk = (tChk - d.checking) * 0.35;
    const fSav = (tSav - d.savings) * 0.08;
    const fCdb = (tCdb - d.cdb) * 0.12;
    d.checking += fChk; d.savings += fSav; d.cdb += fCdb;
    s.cash += fChk + fSav + fCdb;
    R.fluxoDepositos = fChk + fSav + fCdb;
    R.brokerTarget = broker;

    // 5) Compulsório (remunerado só sobre a poupança)
    R.compulsorio = (s.compulsory * (C.COMPULSORY.savings * d.savings) / Math.max(1, requiredCompulsory(s)) * savY) / 1200;
    s.cash += R.compulsorio;
    const reqComp = requiredCompulsory(s);
    s.cash += s.compulsory - reqComp;
    s.compulsory = reqComp;

    // 6) Crédito
    const depTotal = totalDeposits(s);
    let totalDemand = 0;
    for (const k of BG.PRODUCT_KEYS) {
      R.demanda[k] = loanDemand(s, k, cal);
      totalDemand += R.demanda[k];
    }
    R.demandaTotal = totalDemand;
    let scale = 1;
    const cap = analystCapacity(s);
    if (totalDemand > cap && totalDemand > 0) {
      scale = Math.min(scale, cap / totalDemand);
      R.limites.push('analistas');
    }
    if (s.flags.restricted) {
      scale *= 0.4;
      R.limites.push('basileia');
    }
    scale *= modMult(s, 'origination') * execBonus(s, 'origination');
    const available = s.cash + (s.treasury.auto ? s.lft : 0) - C.MIN_OPERATING_CASH * depTotal;
    if (totalDemand * scale > available) {
      scale = Math.max(0, available) / Math.max(1, totalDemand);
      R.limites.push('liquidez');
    }
    for (const k of BG.PRODUCT_KEYS) {
      const pr = s.products[k];
      const p = BG.PRODUCTS[k];
      const B = pr.balance;
      const interest = (B * pr.avgRate) / 1200;
      const dflt = B * monthlyDefaultRate(s, k);
      const amort = (B - dflt) / p.maturity;
      const orig = R.demanda[k] * scale;
      const loss = dflt * (1 - p.recovery);
      const recovered = dflt - loss;
      const after = B - dflt - amort;
      const nb = after + orig;
      if (nb > 0) {
        pr.avgRate = (after * pr.avgRate + orig * pr.rate) / nb;
        pr.risk = (after * pr.risk + orig * newLoanRisk(s, k)) / nb;
      }
      pr.balance = Math.max(0, nb);
      s.cash += interest + amort + recovered - orig;
      R.jurosCreditoBy[k] = interest;
      R.jurosCredito += interest;
      R.perdasBy[k] = loss;
      R.defaultsBy[k] = dflt;
      R.perdasCredito += loss;
      R.defaults += dflt;
      R.originacao[k] = orig;
      R.originacaoTotal += orig;
    }
    // Operações estruturadas (grandes clientes)
    for (const b of s.bigLoans.slice()) {
      const it = (b.amount * b.rate) / 1200;
      R.jurosEstruturadas += it;
      s.cash += it;
      b.monthsLeft--;
      if (chance(s, b.pd / 12)) {
        const loss = b.amount * 0.6;
        R.perdasCredito += loss;
        R.defaults += b.amount;
        s.cash += b.amount - loss;
        s.bigLoans.splice(s.bigLoans.indexOf(b), 1);
        pushNews('bad', `${b.name} deu calote. Perda de ${U.fmtMoney(loss)} após execução das garantias.`);
      } else if (b.monthsLeft <= 0) {
        s.cash += b.amount;
        s.bigLoans.splice(s.bigLoans.indexOf(b), 1);
        pushNews('good', `${b.name} quitou o empréstimo de ${U.fmtMoney(b.amount)}.`);
      }
    }
    R.jurosCredito += R.jurosEstruturadas;
    R.intercambio = R.originacao.cartao * C.INTERCHANGE;
    s.cash += R.intercambio;

    // 7) Tesouraria
    const lftInc = (s.lft * e.selic) / 1200;
    s.lft += lftInc;
    const ltnAcc = (s.ltn.value * s.ltn.rate) / 1200;
    const ltnMtm = -C.LTN_DURATION * (e.prefixChange || 0) / 100 * s.ltn.value;
    s.ltn.value = Math.max(0, s.ltn.value + ltnAcc + ltnMtm);
    const stockMtm = s.stocks * e.stockReturn;
    s.stocks += stockMtm;
    R.jurosTitulos = lftInc + ltnAcc;
    R.resultadoMercado += ltnMtm + stockMtm;
    R.jurosInterbancario = (s.interbank * interbankRate(s)) / 1200 + (s.redesconto * (e.selic + C.REDISCOUNT_SPREAD)) / 1200;
    s.cash -= R.jurosInterbancario;

    // 8) Tarifas
    R.tarifas = s.customers * s.fee + s.customers * C.SERVICE_FEE_PER_CUSTOMER * P * (1 + 0.08 * lvl(s, 'app'));
    s.cash += R.tarifas;

    // 9) Despesas operacionais
    R.pessoal = U.sum(BG.ROLE_KEYS, (r) => s.staff[r] * salary(s, r)) + U.sum(s.executives, (x) => x.salary * P);
    R.agencias = s.branches * C.BRANCH.monthly * P + s.atms * C.ATM.monthly * P;
    R.tecnologia = U.sum(BG.TECH_KEYS, (k) => s.tech[k].level * BG.TECH[k].maint) * P;
    R.servicos = s.customers * costPerCustomer(s);
    R.marketing = s.marketing;
    R.administrativas = C.ADMIN_FIXED * P + (C.ADMIN_ASSETS / 12) * startMetrics.assets;
    R.fgc = depTotal * C.FGC_RATE;
    R.depreciacao = s.fixed * C.DEPRECIATION;
    s.fixed -= R.depreciacao;
    s.cash -= R.pessoal + R.agencias + R.tecnologia + R.servicos + R.marketing + R.administrativas + R.fgc;

    // Custos já pagos entre os fechamentos (contratações, campanhas, eventos)
    const acc = s.acc;
    R.pessoal += acc.pessoal;
    R.marketing += acc.marketing;
    R.outras += acc.outras;
    R.resultadoMercado -= acc.mercado;
    R.capital = acc.capital;
    R.dividendos = acc.dividends;
    R.items = acc.items.slice(-20);
    s.acc = emptyAcc();

    // 10) Rebalanceamento de caixa
    rebalanceTreasury(s, R);

    // 11) Resultado e impostos
    R.receitaTotal = R.jurosCredito + R.jurosTitulos + R.compulsorio + R.tarifas + R.intercambio + Math.max(0, R.resultadoMercado);
    R.despesaTotal = R.jurosPoupanca + R.jurosCdb + R.jurosInterbancario + R.perdasCredito + R.pessoal + R.agencias +
      R.tecnologia + R.servicos + R.marketing + R.administrativas + R.fgc + R.depreciacao + R.outras + Math.max(0, -R.resultadoMercado);
    R.resultadoAntesIR = R.receitaTotal - R.despesaTotal;
    if (R.resultadoAntesIR > 0) {
      const offset = Math.min(s.taxLoss, R.resultadoAntesIR);
      s.taxLoss -= offset;
      R.impostos = (R.resultadoAntesIR - offset) * C.TAX_RATE;
    } else {
      s.taxLoss += -R.resultadoAntesIR;
      R.impostos = 0;
    }
    s.cash -= R.impostos;
    R.lucroLiquido = R.resultadoAntesIR - R.impostos;
    R.margemFinanceira = R.jurosCredito + R.jurosTitulos + R.compulsorio - R.jurosPoupanca - R.jurosCdb - R.jurosInterbancario;
    const gross = R.margemFinanceira + R.tarifas + R.intercambio;
    s.grossEMA = s.grossEMA * 0.9 + Math.max(0, gross) * 0.1;

    // 12) Acumulado do ano e dividendos de dezembro
    accumulateYtd(s, R);
    if (cal === 12 && !warm) {
      const yearNI = s.ytd.lucroLiquido || 0;
      let div = 0;
      const mNow = metrics(s);
      if (yearNI > 0) {
        if (s.flags.restricted || mNow.basel < C.BASEL_MIN) {
          pushNews('bad', 'Banco Central proibiu a distribuição de dividendos: o capital está abaixo do mínimo.');
        } else {
          div = yearNI * (s.payout / 100);
          div = Math.min(div, Math.max(0, mNow.equity * 0.5));
        }
      }
      if (div > 0) {
        s.cash -= div;
        const own = s.shares.player / s.shares.total;
        s.wealth += div * own;
        R.dividendos += div;
        s.ytd.dividendos = (s.ytd.dividendos || 0) + div;
        pushNews('good', `Dividendos de ${U.fmtMoney(div)} aprovados. Sua parte: ${U.fmtMoney(div * own)}.`);
      }
    }
    ensureLiquidity(s, R, 0, true);

    // 13) Patrimônio pessoal rende CDI líquido
    s.wealth *= 1 + (e.selic * 0.85) / 1200;

    // 14) Métricas, regulação e reputação
    const m = metrics(s);
    const repT = reputationBreakdown(s, m).total;
    s.reputation = clamp(s.reputation + (repT - s.reputation) * 0.05, 1, 99);

    if (m.basel < C.BASEL_MIN) {
      if (!s.flags.restricted && !warm) pushNews('bad', `Índice de Basileia em ${U.fmtPct(m.basel)}: abaixo do mínimo de ${U.fmtPct(C.BASEL_MIN)}. O Banco Central restringiu novas concessões e dividendos.`);
      s.flags.restricted = true;
    } else if (s.flags.restricted) {
      s.flags.restricted = false;
      if (!warm) pushNews('good', 'Capital reenquadrado. O Banco Central suspendeu as restrições.');
    }
    s.counters.baselCritical = m.basel < C.BASEL_INTERVENTION ? s.counters.baselCritical + 1 : 0;
    s.counters.baselStrong = m.basel >= 15 ? s.counters.baselStrong + 1 : 0;
    s.counters.redesconto = s.redesconto > 0 ? s.counters.redesconto + 1 : 0;
    if (s.redesconto > 0 && !warm) pushNews('bad', `O banco depende de ${U.fmtMoney(s.redesconto)} em redesconto do Banco Central (Selic + ${C.REDISCOUNT_SPREAD} p.p.).`);

    // Rating anual em abril
    if (cal === 4) updateRating(s, m, warm ? null : pushNews);

    // 15) Concorrentes
    stepCompetitors(s);
    const rank = ranking(s, m);

    // 16) Histórico
    s.history.push({
      m: s.month, assets: m.assets, equity: m.equity, loans: m.loans, deposits: m.deposits, customers: s.customers,
      ni: R.lucroLiquido, revenue: R.receitaTotal, expenses: R.despesaTotal, defaults: R.defaults, basel: m.basel,
      cash: s.cash, liquid: m.liquid, selic: e.selic, inflation: e.inflation, gdp: e.gdp, unemployment: e.unemployment,
      stock: e.stock, valuation: m.valuation, sharePrice: m.sharePrice, npl: m.npl, sat: s.satisfaction, rep: s.reputation,
      rank: rank.position, share: rank.share, roe: m.roe12, P: s.P, nim: R.margemFinanceira, fees: R.tarifas + R.intercambio,
      wealth: s.wealth, score: m.score, orig: R.originacaoTotal, phase: e.phase,
    });
    if (s.history.length > C.HISTORY_MAX) s.history.shift();
    s.last = R;
    s.reports.push(R);
    if (s.reports.length > 12) s.reports.shift();

    // 17) Fim de jogo
    if (!warm) checkGameOver(s, m, pushNews);

    // 18) Contadores e conquistas
    const unlocked = [];
    if (!warm) {
      trackRecession(s, R);
      if (cal === 12) {
        s.counters.profitableYears = (s.ytd.lucroLiquido || 0) > 0 ? s.counters.profitableYears + 1 : 0;
        s.flags.annualReport = { year: s.meta.startYear + Math.floor(s.month / 12), ytd: Object.assign({}, s.ytd), m };
      }
    }
    if (cal === 12) s.ytd = {};

    // 19) Modificadores expiram
    for (const md of s.modifiers) md.months--;
    const expired = s.modifiers.filter((md) => md.months <= 0);
    s.modifiers = s.modifiers.filter((md) => md.months > 0);
    if (!warm) for (const md of expired) if (md.label) pushNews('info', `Fim do efeito: ${md.label}.`);

    s.month++;

    // 20) Eventos e conquistas do novo mês
    if (!warm && !s.over) {
      if (s.meta.duration && s.month >= s.meta.duration && !s.finished) {
        s.finished = true;
        pushNews('good', 'Fim do mandato! Veja o relatório final.');
      }
      if (BG.Events) for (const n of BG.Events.monthly(s)) news.push(n);
      for (const a of checkAchievements(s)) unlocked.push(a);
    }

    if (!warm) {
      for (const n of news) addNews(s, n.type, n.text);
    }
    return { report: R, news, achievements: unlocked };
  }

  function rebalanceTreasury(s, R) {
    const dep = totalDeposits(s);
    const minCash = (s.treasury.minCashPct / 100) * dep;
    // Emergência: caixa negativo
    if (s.cash < 0) ensureLiquidity(s, R, 0);
    // Quita redesconto assim que possível
    if (s.redesconto > 0) {
      if (s.treasury.auto) ensureLiquidityNoBorrow(s, minCash + s.redesconto);
      const pay = Math.min(s.redesconto, Math.max(0, s.cash - (s.treasury.auto ? minCash : 0)));
      s.redesconto -= pay;
      s.cash -= pay;
    }
    if (s.treasury.auto) {
      if (s.cash < minCash) {
        const sell = Math.min(s.lft, minCash - s.cash);
        s.lft -= sell; s.cash += sell;
      } else if (s.cash > minCash * 1.1) {
        const buy = s.cash - minCash;
        s.lft += buy; s.cash -= buy;
      }
    }
  }
  function ensureLiquidityNoBorrow(s, target) {
    const need = target - s.cash;
    if (need <= 0) return;
    const fromLft = Math.min(s.lft, need);
    s.lft -= fromLft;
    s.cash += fromLft;
  }

  function accumulateYtd(s, R) {
    for (const [k, v] of Object.entries(R)) {
      if (typeof v === 'number') s.ytd[k] = (s.ytd[k] || 0) + v;
    }
  }

  function updateRating(s, m, pushNews) {
    let sc = 3;
    if (m.basel >= 16) sc += 1; else if (m.basel >= 13) sc += 0.5; else if (m.basel < C.BASEL_MIN) sc -= 2;
    if (m.roe12 >= 15) sc += 1; else if (m.roe12 >= 8) sc += 0.5; else if (m.roe12 < 0) sc -= 1.5;
    if (m.npl <= 3) sc += 0.5; else if (m.npl > 7) sc -= 1;
    const real = m.assets / s.P;
    if (real >= 5e9) sc += 1; else if (real >= 1e9) sc += 0.5;
    if (s.reputation >= 70) sc += 0.5; else if (s.reputation < 30) sc -= 1;
    if (lvl(s, 'compliance') >= 3) sc += 0.5;
    if (s.redesconto > 0) sc -= 2;
    const idx = clamp(Math.round(sc), 0, BG.RATINGS.length - 1);
    const old = s.rating;
    s.rating = BG.RATINGS[idx];
    if (pushNews) {
      const oi = BG.RATINGS.indexOf(old);
      if (idx > oi) pushNews('good', `Agência de rating eleva a nota do banco de ${old} para ${s.rating}. A captação fica mais barata.`);
      else if (idx < oi) pushNews('bad', `Agência de rating rebaixa a nota do banco de ${old} para ${s.rating}.`);
      else pushNews('info', `Agência de rating mantém a nota ${s.rating}.`);
    }
  }

  function stepCompetitors(s) {
    const e = s.eco;
    for (const c of s.competitors) {
      const g = (e.inflation + e.gdp * c.cyc) / 1200 + c.growth / 12 + c.vol * randn(s);
      c.assets *= 1 + g;
      c.customers *= 1 + (e.gdp * 0.5) / 1200 + (c.growth * 0.8) / 12 + c.vol * 0.5 * randn(s);
      if (c.growth > 0.03) c.growth *= 0.996;
    }
  }

  function ranking(s, m) {
    m = m || metrics(s);
    const list = s.competitors.map((c) => ({ id: c.id, name: c.name, style: c.style, assets: c.assets, customers: c.customers, player: false }));
    list.push({ id: 'player', name: s.meta.bankName, style: 'Você', assets: m.assets, customers: s.customers, player: true });
    list.sort((a, b) => b.assets - a.assets);
    const total = U.sum(list, (x) => x.assets);
    const position = list.findIndex((x) => x.player) + 1;
    return { list, position, share: (m.assets / total) * 100, total };
  }

  function trackRecession(s, R) {
    const c = s.counters;
    if (s.eco.phase === 'recessao') {
      if (!c.recession) c.recession = { profit: 0 };
      c.recession.profit += R.lucroLiquido;
    } else if (c.recession) {
      if (c.recession.profit > 0) s.flags.survivedRecession = true;
      c.recession = null;
    }
  }

  function checkGameOver(s, m, pushNews) {
    if (m.equity <= 0) {
      s.over = true;
      s.overReason = 'falencia';
      pushNews('bad', 'O patrimônio líquido ficou negativo. O Banco Central decretou a liquidação extrajudicial do banco.');
    } else if (s.counters.baselCritical >= 3) {
      s.over = true;
      s.overReason = 'intervencao';
      pushNews('bad', `Índice de Basileia abaixo de ${U.fmtPct(C.BASEL_INTERVENTION)} por três meses. O Banco Central decretou intervenção.`);
    } else if (s.counters.redesconto >= 6) {
      s.over = true;
      s.overReason = 'liquidez';
      pushNews('bad', 'Seis meses seguidos dependendo do redesconto. O Banco Central decretou intervenção por falta de liquidez.');
    } else if (s.counters.baselCritical > 0) {
      pushNews('bad', `ALERTA: Basileia abaixo de ${U.fmtPct(C.BASEL_INTERVENTION)}. Mais ${3 - s.counters.baselCritical} mês(es) assim e o banco sofrerá intervenção.`);
    } else if (s.counters.redesconto >= 3) {
      pushNews('bad', `ALERTA: ${s.counters.redesconto} meses no redesconto. Com 6 meses o Banco Central intervém.`);
    }
  }

  function addNews(s, type, text) {
    s.news.push({ m: s.month, type, text });
    if (s.news.length > C.NEWS_MAX) s.news.splice(0, s.news.length - C.NEWS_MAX);
  }

  // ======================================================================
  // Conquistas
  // ======================================================================
  BG.ACHIEVEMENTS = [
    { id: 'lucro', name: 'Primeiro lucro', desc: 'Feche um mês com lucro líquido.', check: (s) => s.last && s.last.lucroLiquido > 0 },
    { id: 'clientes50k', name: '50 mil clientes', desc: 'Alcance 50 mil clientes.', check: (s) => s.customers >= 50000 },
    { id: 'clientes250k', name: 'Banco popular', desc: 'Alcance 250 mil clientes.', check: (s) => s.customers >= 250000 },
    { id: 'clientes1m', name: 'Um milhão de clientes', desc: 'Alcance 1 milhão de clientes.', check: (s) => s.customers >= 1000000 },
    { id: 'ativos1bi', name: 'Banco bilionário', desc: 'Ativos totais acima de R$ 1 bilhão.', check: (s, m) => m.assets >= 1e9 },
    { id: 'ativos10bi', name: 'Gigante regional', desc: 'Ativos totais acima de R$ 10 bilhões.', check: (s, m) => m.assets >= 1e10 },
    { id: 'ativos50bi', name: 'Peso pesado', desc: 'Ativos totais acima de R$ 50 bilhões.', check: (s, m) => m.assets >= 5e10 },
    { id: 'agencias10', name: 'Rede de agências', desc: 'Tenha 10 agências abertas.', check: (s) => s.branches >= 10 },
    { id: 'app5', name: 'Banco do futuro', desc: 'Leve o app ao nível máximo.', check: (s) => s.tech.app.level >= 5 },
    { id: 'tech3', name: 'Modernização completa', desc: 'Todas as tecnologias no nível 3 ou mais.', check: (s) => BG.TECH_KEYS.every((k) => s.tech[k].level >= 3) },
    { id: 'ipo', name: 'Toque da campainha', desc: 'Abra o capital do banco na bolsa.', check: (s) => s.shares.listed },
    { id: 'top3', name: 'Pódio', desc: 'Fique entre os 3 maiores bancos do mercado.', check: (s) => s.history.length && s.history[s.history.length - 1].rank <= 3 },
    { id: 'lider', name: 'Número um', desc: 'Torne-se o maior banco do mercado.', check: (s) => s.history.length && s.history[s.history.length - 1].rank === 1 },
    { id: 'rico', name: 'Fortuna pessoal', desc: 'Acumule R$ 100 milhões em patrimônio pessoal.', check: (s) => s.wealth >= 1e8 },
    { id: 'basileia', name: 'Capital de ferro', desc: 'Basileia acima de 15% por 24 meses seguidos.', check: (s) => s.counters.baselStrong >= 24 },
    { id: 'recessao', name: 'À prova de crise', desc: 'Atravesse uma recessão inteira com lucro acumulado.', check: (s) => !!s.flags.survivedRecession },
    { id: 'anos5', name: 'Cinco anos no azul', desc: 'Feche cinco anos seguidos com lucro.', check: (s) => s.counters.profitableYears >= 5 },
    { id: 'npl', name: 'Carteira impecável', desc: 'Inadimplência abaixo de 2% com carteira acima de R$ 1 bilhão.', check: (s, m) => m.loans >= 1e9 && m.npl < 2 && s.history.length >= 12 },
    { id: 'reputacao', name: 'Marca admirada', desc: 'Reputação acima de 85.', check: (s) => s.reputation >= 85 },
    { id: 'satisfacao', name: 'Clientes fãs', desc: 'Satisfação acima de 85.', check: (s) => s.satisfaction >= 85 },
    { id: 'aaa', name: 'Nota máxima', desc: 'Receba rating AAA.', check: (s) => s.rating === 'AAA' },
    { id: 'roe', name: 'Máquina de lucro', desc: 'ROE acima de 25% em 12 meses.', check: (s, m) => m.roe12 >= 25 && s.month >= 12 },
    { id: 'decada', name: 'Uma década no comando', desc: 'Complete 10 anos à frente do banco.', check: (s) => s.month >= 120 },
  ];

  function checkAchievements(s) {
    const m = metrics(s);
    const out = [];
    for (const a of BG.ACHIEVEMENTS) {
      if (s.achievements[a.id] != null) continue;
      let ok = false;
      try { ok = !!a.check(s, m); } catch (err) { ok = false; }
      if (ok) {
        s.achievements[a.id] = s.month;
        out.push(a);
        addNews(s, 'achievement', `Conquista desbloqueada: ${a.name}.`);
      }
    }
    return out;
  }

  // ======================================================================
  // Ações do jogador
  // ======================================================================
  const ok = (msg) => ({ ok: true, msg });
  const fail = (msg) => ({ ok: false, msg });

  function availableCash(s) {
    return s.cash + s.lft;
  }
  // Paga com caixa, resgatando Tesouro Selic se preciso.
  function pay(s, amount) {
    if (amount > availableCash(s) + 1e-6) return false;
    if (s.cash < amount) {
      const need = amount - s.cash;
      s.lft -= need;
      s.cash += need;
    }
    s.cash -= amount;
    return true;
  }
  function spend(s, amount, cat, label) {
    s.cash -= amount;
    s.acc[cat] += amount;
    if (label) s.acc.items.push({ label, amount });
    if (s.cash < 0) ensureLiquidity(s, null, 0);
  }

  function guard(s) {
    if (s.over) return fail('O jogo terminou. Comece um novo jogo.');
    return null;
  }

  const actions = {
    setRate(s, key, rate) {
      const g = guard(s); if (g) return g;
      if (!BG.PRODUCTS[key]) return fail('Produto inválido.');
      rate = clamp(Number(rate) || 0, 0, 400);
      const capR = rateCap(s, key);
      if (capR != null && rate > capR) return fail(`Teto regulatório: no máximo ${U.fmtPct(capR)} ao ano.`);
      s.products[key].rate = Math.round(rate * 10) / 10;
      return ok();
    },
    setPolicy(s, key, policy) {
      const g = guard(s); if (g) return g;
      if (!BG.PRODUCTS[key] || !BG.POLICIES[policy]) return fail('Política inválida.');
      s.products[key].policy = policy;
      return ok();
    },
    setFee(s, fee) {
      const g = guard(s); if (g) return g;
      s.fee = Math.round(clamp(Number(fee) || 0, 0, 80 * s.P) * 10) / 10;
      return ok();
    },
    setCdbPct(s, pct) {
      const g = guard(s); if (g) return g;
      s.cdbPct = Math.round(clamp(Number(pct) || 0, 70, 160));
      return ok();
    },
    hire(s, role, n) {
      const g = guard(s); if (g) return g;
      n = Math.floor(n);
      if (!BG.ROLES[role] || n <= 0) return fail('Contratação inválida.');
      const cost = salary(s, role) * n;
      if (!pay(s, cost)) return fail('Caixa insuficiente para os custos de contratação.');
      s.acc.pessoal += cost;
      s.staff[role] += n;
      return ok(`${n} contratação(ões) em ${BG.ROLES[role].name}. Custo de recrutamento e treinamento: ${U.fmtMoney(cost)}.`);
    },
    fire(s, role, n) {
      const g = guard(s); if (g) return g;
      n = Math.min(Math.floor(n), s.staff[role]);
      if (!BG.ROLES[role] || n <= 0) return fail('Não há ninguém para desligar.');
      const cost = salary(s, role) * 2 * n;
      s.staff[role] -= n;
      spend(s, cost, 'pessoal');
      const total = U.sum(BG.ROLE_KEYS, (r) => s.staff[r]) + n;
      if (n / total > 0.1) {
        s.reputation = clamp(s.reputation - 2, 1, 99);
        s.satisfaction = clamp(s.satisfaction - 2, 1, 99);
        return ok(`Demissão em massa: ${n} desligamentos. Rescisões de ${U.fmtMoney(cost)}. A imprensa noticiou os cortes.`);
      }
      return ok(`${n} desligamento(s). Rescisões: ${U.fmtMoney(cost)}.`);
    },
    openBranch(s) {
      const g = guard(s); if (g) return g;
      const cost = C.BRANCH.cost * s.P;
      if (!pay(s, cost)) return fail(`Abrir uma agência custa ${U.fmtMoney(cost)}. Caixa insuficiente.`);
      s.fixed += cost;
      s.branches++;
      return ok(`Agência nº ${s.branches} inaugurada por ${U.fmtMoney(cost)}.`);
    },
    closeBranch(s) {
      const g = guard(s); if (g) return g;
      if (s.branches <= 0) return fail('Não há agências para fechar.');
      const book = Math.min(s.fixed, C.BRANCH.book * s.P);
      const recover = C.BRANCH.cost * s.P * C.BRANCH.sellBack;
      s.fixed -= book;
      s.cash += Math.min(recover, book);
      const loss = Math.max(0, book - recover);
      s.acc.outras += loss;
      const lost = (s.customers / s.branches) * 0.15;
      s.customers -= lost;
      s.branches--;
      return ok(`Agência fechada. ${U.fmtNum(lost)} clientes encerraram a conta.`);
    },
    buyAtm(s, n = 1) {
      const g = guard(s); if (g) return g;
      const cost = C.ATM.cost * s.P * n;
      if (!pay(s, cost)) return fail('Caixa insuficiente.');
      s.fixed += cost;
      s.atms += n;
      return ok(`${n} caixa(s) eletrônico(s) instalado(s).`);
    },
    sellAtm(s, n = 1) {
      const g = guard(s); if (g) return g;
      n = Math.min(n, s.atms);
      if (n <= 0) return fail('Não há caixas eletrônicos.');
      const book = Math.min(s.fixed, C.ATM.book * s.P * n);
      s.fixed -= book;
      s.cash += book * 0.2;
      s.acc.outras += book * 0.8;
      s.atms -= n;
      return ok(`${n} caixa(s) eletrônico(s) desativado(s).`);
    },
    startUpgrade(s, key) {
      const g = guard(s); if (g) return g;
      const t = s.tech[key];
      const def = BG.TECH[key];
      if (!def) return fail('Tecnologia inválida.');
      if (t.building) return fail('Já existe um projeto em andamento nesta área.');
      if (t.level >= 5) return fail('Nível máximo atingido.');
      const minTI = (t.level + 1) * 2;
      if (s.staff.ti < minTI) return fail(`Este projeto exige pelo menos ${minTI} pessoas na equipe de TI.`);
      const cost = def.costs[t.level] * s.P;
      if (!pay(s, cost)) return fail(`O projeto custa ${U.fmtMoney(cost)}. Caixa insuficiente.`);
      s.fixed += cost;
      t.building = { target: t.level + 1, monthsLeft: 2 + t.level, total: 2 + t.level };
      return ok(`Projeto iniciado: ${def.name} nível ${t.level + 1}. Conclusão em ${2 + t.level} meses.`);
    },
    setMarketing(s, v) {
      const g = guard(s); if (g) return g;
      s.marketing = Math.max(0, Math.round(Number(v) || 0));
      return ok();
    },
    runCampaign(s, key) {
      const g = guard(s); if (g) return g;
      const c = BG.CAMPAIGNS[key];
      if (!c) return fail('Campanha inválida.');
      const until = s.flags.campaigns[key] || -999;
      if (s.month < until) return fail(`Disponível novamente em ${until - s.month} mês(es).`);
      const cost = c.cost * s.P;
      if (!pay(s, cost)) return fail('Caixa insuficiente.');
      s.acc.marketing += cost;
      s.awareness = clamp(s.awareness + c.awareness * (1 - s.awareness * 0.6), 0, 0.97);
      s.reputation = clamp(s.reputation + c.rep, 1, 99);
      if (c.modifier) addModifier(s, Object.assign({ id: 'camp-' + key, label: c.name }, c.modifier));
      s.flags.campaigns[key] = s.month + c.cooldown;
      return ok(`${c.name}: campanha no ar.`);
    },
    trade(s, asset, amount) {
      // amount > 0 compra, < 0 vende. asset: lft | ltn | stocks
      const g = guard(s); if (g) return g;
      amount = Number(amount) || 0;
      if (!amount) return fail('Informe um valor.');
      if (amount > 0) {
        if (asset === 'lft') {
          if (amount > s.cash + 1e-6) return fail('Caixa insuficiente.');
          s.cash -= amount; s.lft += amount;
          return ok(`Aplicados ${U.fmtMoney(amount)} em Tesouro Selic.`);
        }
        if (!pay(s, amount)) return fail('Caixa insuficiente (caixa + Tesouro Selic).');
        if (asset === 'ltn') {
          const nv = s.ltn.value + amount;
          s.ltn.rate = (s.ltn.value * s.ltn.rate + amount * s.eco.prefix) / nv;
          s.ltn.value = nv;
          return ok(`Comprados ${U.fmtMoney(amount)} em prefixados a ${U.fmtPct(s.eco.prefix, 2)} ao ano.`);
        }
        if (asset === 'stocks') {
          const fee = amount * 0.001;
          s.stocks += amount - fee;
          s.acc.mercado += fee;
          return ok(`Comprados ${U.fmtMoney(amount)} em ações (corretagem ${U.fmtMoney(fee)}).`);
        }
        return fail('Ativo inválido.');
      }
      const v = -amount;
      if (asset === 'lft') {
        const x = Math.min(v, s.lft);
        s.lft -= x; s.cash += x;
        return ok(`Resgatados ${U.fmtMoney(x)} do Tesouro Selic.`);
      }
      if (asset === 'ltn') {
        const x = Math.min(v, s.ltn.value);
        s.ltn.value -= x;
        s.cash += x * 0.999;
        s.acc.mercado += x * 0.001;
        return ok(`Vendidos ${U.fmtMoney(x)} em prefixados.`);
      }
      if (asset === 'stocks') {
        const x = Math.min(v, s.stocks);
        s.stocks -= x;
        s.cash += x * 0.999;
        s.acc.mercado += x * 0.001;
        return ok(`Vendidos ${U.fmtMoney(x)} em ações.`);
      }
      return fail('Ativo inválido.');
    },
    borrow(s, amount) {
      const g = guard(s); if (g) return g;
      amount = Number(amount) || 0;
      const m = metrics(s);
      if (amount <= 0) return fail('Informe um valor.');
      if (s.interbank + amount > m.interbankLimit) return fail(`Limite interbancário: ${U.fmtMoney(m.interbankLimit)} (depende do patrimônio e do rating).`);
      s.interbank += amount;
      s.cash += amount;
      return ok(`Captados ${U.fmtMoney(amount)} no interbancário a ${U.fmtPct(interbankRate(s), 2)} ao ano.`);
    },
    repay(s, amount) {
      const g = guard(s); if (g) return g;
      amount = Math.min(Number(amount) || 0, s.interbank);
      if (amount <= 0) return fail('Não há dívida interbancária.');
      if (!pay(s, amount)) return fail('Caixa insuficiente.');
      s.interbank -= amount;
      return ok(`Quitados ${U.fmtMoney(amount)} do interbancário.`);
    },
    setTreasury(s, patch) {
      const g = guard(s); if (g) return g;
      if (patch.minCashPct != null) s.treasury.minCashPct = clamp(Number(patch.minCashPct), 2, 40);
      if (patch.auto != null) s.treasury.auto = !!patch.auto;
      return ok();
    },
    setPayout(s, pct) {
      const g = guard(s); if (g) return g;
      s.payout = clamp(Math.round(Number(pct) || 25), 25, 100);
      return ok();
    },
    extraDividend(s, amount) {
      const g = guard(s); if (g) return g;
      amount = Number(amount) || 0;
      const m = metrics(s);
      if (amount <= 0) return fail('Informe um valor.');
      if (s.flags.restricted) return fail('O Banco Central proibiu dividendos enquanto o capital estiver abaixo do mínimo.');
      const after = (m.equity - amount) / m.rwa * 100;
      if (after < C.BASEL_MIN + 1) return fail(`Esse pagamento deixaria a Basileia em ${U.fmtPct(after)}. O conselho exige no mínimo ${U.fmtPct(C.BASEL_MIN + 1)}.`);
      if (!pay(s, amount)) return fail('Caixa insuficiente.');
      const own = s.shares.player / s.shares.total;
      s.acc.dividends += amount;
      s.wealth += amount * own;
      return ok(`Dividendos extraordinários de ${U.fmtMoney(amount)}. Você recebeu ${U.fmtMoney(amount * own)}.`);
    },
    issueShares(s, amount) {
      const g = guard(s); if (g) return g;
      amount = Number(amount) || 0;
      const m = metrics(s);
      if (amount <= 0) return fail('Informe um valor.');
      const until = s.flags.nextIssue || -999;
      if (s.month < until) return fail(`Investidores só aceitam nova emissão em ${until - s.month} mês(es).`);
      if (amount > Math.max(m.equity, 0) * 1.0 + 1) return fail(`O mercado absorve no máximo ${U.fmtMoney(Math.max(0, m.equity))} por emissão (100% do patrimônio).`);
      let discount = s.shares.listed ? 0.92 : 0.85;
      if (s.reputation < 30 || m.ni12 < 0) discount -= 0.15;
      const price = m.sharePrice * discount;
      if (price <= 0) return fail('Ninguém quer comprar ações do banco agora.');
      const n = amount / price;
      s.shares.total += n;
      s.cash += amount;
      s.acc.capital += amount;
      s.flags.nextIssue = s.month + 6;
      return ok(`Emissão de ${U.fmtNum(n)} ações a ${U.fmtMoney(price)} cada, captando ${U.fmtMoney(amount)}. Sua participação caiu para ${U.fmtPct((s.shares.player / s.shares.total) * 100)}.`);
    },
    injectCapital(s, amount) {
      const g = guard(s); if (g) return g;
      amount = Number(amount) || 0;
      if (amount <= 0) return fail('Informe um valor.');
      if (amount > s.wealth + 1e-6) return fail('Seu patrimônio pessoal não é suficiente.');
      const m = metrics(s);
      const price = Math.max(m.sharePrice, 0.01);
      const n = amount / price;
      s.wealth -= amount;
      s.shares.total += n;
      s.shares.player += n;
      s.cash += amount;
      s.acc.capital += amount;
      return ok(`Você aportou ${U.fmtMoney(amount)} e recebeu ${U.fmtNum(n)} novas ações.`);
    },
    buyback(s, amount) {
      const g = guard(s); if (g) return g;
      amount = Number(amount) || 0;
      const m = metrics(s);
      if (!s.shares.listed) return fail('Recompra só é possível com ações negociadas em bolsa.');
      if (amount <= 0) return fail('Informe um valor.');
      if (s.flags.restricted) return fail('Recompra proibida enquanto o capital estiver abaixo do mínimo.');
      const after = (m.equity - amount) / m.rwa * 100;
      if (after < C.BASEL_MIN + 1) return fail(`A recompra deixaria a Basileia em ${U.fmtPct(after)}.`);
      const free = s.shares.total - s.shares.player;
      const price = m.sharePrice * 1.03;
      const n = Math.min(free * 0.5, amount / price);
      if (n <= 0) return fail('Não há ações em circulação para recomprar.');
      if (!pay(s, n * price)) return fail('Caixa insuficiente.');
      s.shares.total -= n;
      s.acc.capital -= n * price;
      return ok(`Recompradas ${U.fmtNum(n)} ações por ${U.fmtMoney(n * price)}. Sua participação subiu para ${U.fmtPct((s.shares.player / s.shares.total) * 100)}.`);
    },
    ipo(s) {
      const g = guard(s); if (g) return g;
      const chk = ipoCheck(s);
      if (!chk.ok) return fail(chk.reasons.join(' '));
      s.shares.listed = true;
      const m2 = metrics(s);
      const price = m2.sharePrice * 0.95;
      const n = (s.shares.total * 0.25) / 0.75;
      const raised = n * price;
      s.shares.total += n;
      s.cash += raised;
      s.acc.capital += raised;
      s.reputation = clamp(s.reputation + 5, 1, 99);
      s.awareness = clamp(s.awareness + 0.08, 0, 0.97);
      return ok(`IPO concluído! ${U.fmtNum(n)} novas ações a ${U.fmtMoney(price)} captaram ${U.fmtMoney(raised)}. Você mantém ${U.fmtPct((s.shares.player / s.shares.total) * 100)} do banco.`);
    },
    fireExecutive(s, idx) {
      const g = guard(s); if (g) return g;
      const ex = s.executives[idx];
      if (!ex) return fail('Executivo não encontrado.');
      s.executives.splice(idx, 1);
      spend(s, ex.salary * s.P * 6, 'pessoal');
      return ok(`${ex.name} deixou o banco. Multa contratual de ${U.fmtMoney(ex.salary * s.P * 6)}.`);
    },
  };

  function ipoCheck(s) {
    const m = metrics(s);
    const reasons = [];
    if (s.shares.listed) reasons.push('O banco já é listado.');
    const minEq = 250e6 * s.P;
    if (m.equity < minEq) reasons.push(`Patrimônio mínimo de ${U.fmtMoney(minEq)}.`);
    if (s.reputation < 50) reasons.push('Reputação mínima de 50.');
    if (m.ni12 <= 0 || s.history.length < 12) reasons.push('Lucro nos últimos 12 meses.');
    if (lvl(s, 'compliance') < 2) reasons.push('Compliance e Governança nível 2.');
    return { ok: reasons.length === 0, reasons, minEq };
  }

  BG.Engine = {
    newGame, simulateMonth, metrics, actions, ipoCheck,
    // fórmulas expostas para a interface e para os eventos
    marketRate, rateCap, cdbMarketPct, cdbFactor, interbankRate, brokerTarget, idealAttendants, idealManagers,
    requiredTI, analystCapacity, salesFactor, addressable, digitalReach, costPerCustomer, satisfactionBreakdown, reputationBreakdown,
    acquisitionInfo, econDemand, econDefault, rateDemand, approvalRate, newLoanRisk, loanDemand, monthlyDefaultRate,
    totalDeposits, totalLoans, salary, calMonth, ranking, addModifier, modMult, modAdd, spend, pay, ensureLiquidity,
    addNews, availableCash, requiredCompulsory, lvl, emptyAcc,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
