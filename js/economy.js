/* Macroeconomia: ciclo econômico, PIB, desemprego, inflação, Selic (COPOM) e bolsa. */
(function (G) {
  'use strict';
  const BG = (G.BankGame = G.BankGame || {});
  const { rand, randn, chance, clamp } = BG.U;

  function newEconomy() {
    return {
      phase: 'expansao',
      phaseMonths: 6,
      gdp: 2.3,
      inflation: 4.2,
      unemployment: 7.8,
      selic: 10.5,
      prefix: 11.2, // taxa de mercado do título prefixado (LTN) de ~3 anos
      stock: 130000,
      stockHist: [130000],
      inflation12: 4.2,
      lastCopom: null,
    };
  }

  // Rendimento anual da poupança pela regra brasileira
  function savingsYield(selic) {
    if (selic > 8.5) return 6.17 + Math.max(0, (selic - 8.5) * 0.12);
    return selic * 0.7;
  }

  function modAdd(s, kind) {
    let v = 0;
    for (const m of s.modifiers) if (m.kind === kind) v += m.value;
    return v;
  }

  // Avança a economia um mês. Retorna lista de notícias.
  function step(s) {
    const e = s.eco;
    const news = [];
    const diff = BG.DIFFICULTY[s.meta.difficulty];
    const ph = BG.PHASES[e.phase];
    const cal = (s.month % 12) + 1;

    // Troca de fase do ciclo
    e.phaseMonths++;
    let pTransition = 1 / ph.avg;
    if (e.phase === 'recessao') pTransition /= Math.sqrt(diff.recession);
    if (e.phaseMonths >= ph.min && chance(s, pTransition)) {
      const opts = Object.keys(ph.next);
      const weights = opts.map((k) => ph.next[k] * (k === 'recessao' ? diff.recession : 1));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rand(s) * total;
      let next = opts[0];
      for (let i = 0; i < opts.length; i++) {
        r -= weights[i];
        if (r <= 0) { next = opts[i]; break; }
      }
      e.phase = next;
      e.phaseMonths = 0;
      const msgs = {
        expansao: 'Economia entra em fase de expansão: emprego e consumo crescem.',
        boom: 'Economia aquecida: o crédito cresce forte, mas a inflação preocupa.',
        desaceleracao: 'Sinais de desaceleração: indústria e varejo perdem fôlego.',
        recessao: 'O país entrou em recessão. Espere mais desemprego e calotes.',
        recuperacao: 'A economia começa a se recuperar da recessão.',
      };
      news.push({ type: next === 'recessao' ? 'bad' : next === 'desaceleracao' ? 'warn' : 'eco', text: msgs[next] });
    }
    const cur = BG.PHASES[e.phase];

    // PIB (variação anualizada, %)
    e.gdp += (cur.gdp - e.gdp) * 0.15 + randn(s) * 0.25 + modAdd(s, 'gdpShock') * 0.2;
    e.gdp = clamp(e.gdp, -9, 9);

    // Desemprego (%)
    const uTarget = 8.5 - 0.9 * (e.gdp - 2);
    e.unemployment += (uTarget - e.unemployment) * 0.07 + randn(s) * 0.07;
    e.unemployment = clamp(e.unemployment, 3.5, 20);

    // Inflação (% em 12 meses, suavizada)
    const real = e.selic - e.inflation;
    e.inflation += (cur.infl - e.inflation) * 0.06 - 0.012 * (real - 4.5) + randn(s) * 0.16 + modAdd(s, 'inflShock') * 0.15;
    e.inflation = clamp(e.inflation, 0.2, 25);

    // COPOM
    e.lastCopom = null;
    if (BG.CONFIG.COPOM_MONTHS.includes(cal)) {
      const desired = clamp(7.5 + 1.5 * (e.inflation - 3) + 0.5 * (e.gdp - 2), 2, 24);
      const diffRate = desired - e.selic;
      let change = 0;
      if (Math.abs(diffRate) >= 0.2) {
        const mag = Math.min(1.0, Math.max(0.25, Math.round((Math.abs(diffRate) * 0.5) * 4) / 4));
        change = Math.sign(diffRate) * mag;
      }
      e.selic = Math.round((e.selic + change) * 100) / 100;
      e.lastCopom = change;
      if (change > 0) news.push({ type: 'eco', text: `COPOM eleva a Selic em ${BG.U.fmtNum(change * 100)} pontos-base, para ${BG.U.fmtPct(e.selic, 2)} ao ano.` });
      else if (change < 0) news.push({ type: 'eco', text: `COPOM corta a Selic em ${BG.U.fmtNum(-change * 100)} pontos-base, para ${BG.U.fmtPct(e.selic, 2)} ao ano.` });
      else news.push({ type: 'eco', text: `COPOM mantém a Selic em ${BG.U.fmtPct(e.selic, 2)} ao ano.` });
    }

    // Taxa prefixada de ~3 anos: parte Selic atual, parte expectativa de longo prazo
    const prevPrefix = e.prefix;
    e.prefix = clamp(0.55 * e.selic + 0.45 * (7.5 + e.inflation) + 0.8 + randn(s) * 0.12, 2, 28);
    e.prefixChange = e.prefix - prevPrefix;

    // Bolsa
    const vol = e.phase === 'recessao' ? 0.075 : 0.05;
    let ret = 0.0065 + 0.0015 * (e.gdp - 2) - 0.012 * (e.lastCopom || 0) + vol * randn(s);
    ret += modAdd(s, 'stockShock');
    ret = clamp(ret, -0.3, 0.25);
    e.stockReturn = ret;
    e.stock = Math.max(5000, e.stock * (1 + ret));
    e.stockHist.push(e.stock);
    if (e.stockHist.length > 13) e.stockHist.shift();

    // Índice de preços
    const monthlyInfl = Math.pow(1 + e.inflation / 100, 1 / 12) - 1;
    s.P *= 1 + monthlyInfl;
    e.inflation12 = e.inflation;

    return news;
  }

  BG.Economy = { newEconomy, step, savingsYield };
})(typeof globalThis !== 'undefined' ? globalThis : window);
