const test = require('node:test');
const assert = require('node:assert/strict');
const { BG, E, A, pendingAcc, competent, reckless, resolvePending, play } = require('./helpers');

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (s) => JSON.parse(JSON.stringify(s));

test('novo jogo é válido em todos os cenários e dificuldades', () => {
  for (const scenario of Object.keys(BG.SCENARIOS)) {
    for (const difficulty of Object.keys(BG.DIFFICULTY)) {
      const s = E.newGame({ scenario, difficulty, seed: 7 });
      const m = E.metrics(s);
      assert.equal(s.month, 0);
      assert.equal(s.history.length, 12, 'um ano de histórico antes de assumir');
      assert.ok(m.equity > 0, `${scenario}/${difficulty}: patrimônio positivo`);
      assert.ok(m.basel > BG.CONFIG.BASEL_MIN, `${scenario}/${difficulty}: Basileia acima do mínimo (${m.basel.toFixed(1)})`);
      assert.ok(s.cash >= 0 && s.redesconto === 0);
      for (const k of ['assets', 'loans', 'deposits', 'valuation', 'sharePrice', 'roe12', 'npl']) assert.ok(finite(m[k]), k);
      assert.equal(s.over, false);
      assert.equal(s.news.length, 1);
    }
  }
});

test('contabilidade fecha: variação do patrimônio = lucro − dividendos + capital', () => {
  for (const scenario of Object.keys(BG.SCENARIOS)) {
    for (const seed of [1, 2, 3]) {
      const s = E.newGame({ scenario, seed });
      let prev = E.metrics(s).equity + pendingAcc(s);
      for (let i = 0; i < 120 && !s.over; i++) {
        resolvePending(s, seed === 2 ? 'last' : 'first');
        if (seed === 3) competent(s);
        if (i === 30 && seed === 1) {
          A.trade(s, 'stocks', 2e6);
          A.trade(s, 'ltn', 3e6);
          A.borrow(s, 1e6);
          A.hire(s, 'analistas', 2);
          A.fire(s, 'atendimento', 1);
          A.runCampaign(s, 'tv');
          A.extraDividend(s, 1e5);
        }
        const r = E.simulateMonth(s);
        const now = E.metrics(s).equity + pendingAcc(s);
        const R = r.report;
        const expected = prev + R.lucroLiquido - R.dividendos + R.capital;
        assert.ok(Math.abs(now - expected) <= Math.max(1, Math.abs(now) * 1e-9),
          `${scenario}/${seed} mês ${s.month}: PL ${now} esperado ${expected}`);
        prev = now;
      }
    }
  }
});

test('a mesma semente reproduz exatamente o mesmo jogo', () => {
  const a = play({ seed: 42 }, 60, competent);
  const b = play({ seed: 42 }, 60, competent);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = play({ seed: 43 }, 60, competent);
  assert.notEqual(JSON.stringify(a.eco), JSON.stringify(c.eco));
});

test('salvar e carregar continua o jogo de forma idêntica', () => {
  const s = play({ seed: 9 }, 30, competent);
  const loaded = clone(s);
  for (let i = 0; i < 24; i++) {
    resolvePending(s);
    resolvePending(loaded);
    E.simulateMonth(s);
    E.simulateMonth(loaded);
  }
  assert.equal(JSON.stringify(s), JSON.stringify(loaded));
});

test('ações do jogador alteram o estado e respeitam limites', () => {
  const s = E.newGame({ seed: 5 });
  const cash0 = s.cash + s.lft;
  const before = s.staff.analistas;
  assert.ok(A.hire(s, 'analistas', 3).ok);
  assert.equal(s.staff.analistas, before + 3);
  assert.ok(s.cash + s.lft < cash0, 'contratação custa dinheiro');
  assert.ok(s.acc.pessoal > 0);

  const fixed0 = s.fixed;
  assert.ok(A.openBranch(s).ok);
  assert.ok(s.fixed > fixed0);
  assert.equal(s.branches, 2);

  const r = A.startUpgrade(s, 'app');
  assert.ok(r.ok, r.msg);
  assert.equal(A.startUpgrade(s, 'app').ok, false, 'um projeto por vez');
  const months = s.tech.app.building.monthsLeft;
  for (let i = 0; i < months; i++) { resolvePending(s); E.simulateMonth(s); }
  assert.equal(s.tech.app.level, 2);
  assert.equal(s.tech.app.building, null);

  assert.equal(A.setRate(s, 'pessoal', -5).ok, true);
  assert.equal(s.products.pessoal.rate, 0);
  assert.ok(A.setPolicy(s, 'cartao', 'conservadora').ok);
  assert.equal(A.setPolicy(s, 'cartao', 'inexistente').ok, false);

  const m = E.metrics(s);
  assert.equal(A.borrow(s, m.interbankLimit * 2).ok, false, 'limite interbancário');
  assert.ok(A.borrow(s, 1e6).ok);
  assert.ok(A.repay(s, 1e6).ok);
  assert.equal(s.interbank, 0);

  assert.equal(A.ipo(s).ok, false, 'IPO exige requisitos');
  assert.equal(A.injectCapital(s, 1).ok, false, 'sem patrimônio pessoal');
  assert.equal(A.buyback(s, 1e6).ok, false, 'recompra só listado');
  assert.ok(A.setPayout(s, 10).ok);
  assert.equal(s.payout, 25, 'payout mínimo legal');
});

test('emissão de ações dilui o controlador e aumenta o capital', () => {
  const s = E.newGame({ seed: 11 });
  const m0 = E.metrics(s);
  const r = A.issueShares(s, m0.equity * 0.2);
  assert.ok(r.ok, r.msg);
  assert.ok(s.shares.player / s.shares.total < 1);
  assert.equal(A.issueShares(s, 1e6).ok, false, 'espera entre emissões');
  assert.ok(Math.abs(E.metrics(s).equity - m0.equity * 1.2) < 1);
});

test('todas as opções de todos os eventos podem ser resolvidas', () => {
  const base = play({ seed: 3 }, 40, competent);
  resolvePending(base);
  for (const ev of BG.Events.list) {
    if (ev.choices) {
      for (let i = 0; i < ev.choices.length; i++) {
        const s = clone(base);
        s.pendingEvent = null;
        BG.Events.force(s, ev.id);
        assert.ok(s.pendingEvent, ev.id);
        const cur = BG.Events.current(s);
        assert.ok(cur.text.length > 20, `${ev.id}: texto`);
        if (!cur.choices[i].available) continue;
        const res = BG.Events.resolve(s, i);
        assert.ok(res.ok, `${ev.id}/${i}`);
        if (!res.keep) assert.equal(s.pendingEvent, null);
        const m = E.metrics(s);
        assert.ok(finite(m.equity) && finite(m.basel), `${ev.id}/${i}: métricas finitas`);
        assert.ok(s.cash >= -1e-6, `${ev.id}/${i}: caixa não negativo`);
        E.simulateMonth(s);
      }
    } else {
      const s = clone(base);
      s.pendingEvent = null;
      const news = BG.Events.force(s, ev.id);
      assert.equal(news.length, 1, ev.id);
      assert.ok(finite(E.metrics(s).equity));
      E.simulateMonth(s);
    }
  }
});

test('patrimônio negativo leva à liquidação', () => {
  const s = E.newGame({ seed: 2 });
  s.products.pessoal.balance = 0;
  s.products.cartao.balance = 0;
  s.products.empresas.balance = 0;
  s.lft = 0;
  E.simulateMonth(s);
  assert.equal(s.over, true);
  assert.equal(s.overReason, 'falencia');
  assert.equal(E.simulateMonth(s), null, 'jogo encerrado não avança');
  assert.equal(A.hire(s, 'ti', 1).ok, false);
});

test('Basileia abaixo do mínimo restringe crédito e dividendos', () => {
  const s = E.newGame({ seed: 4 });
  const m = E.metrics(s);
  // Converte títulos em crédito arriscado até derrubar o índice
  const shift = s.lft * 0.95;
  s.lft -= shift;
  s.products.empresas.balance += shift;
  s.bigLoans.push({ name: 'Teste', amount: m.equity * 10, rate: 20, monthsLeft: 60, pd: 0, grade: 'A' });
  s.interbank += m.equity * 10;
  E.simulateMonth(s);
  assert.ok(E.metrics(s).basel < BG.CONFIG.BASEL_MIN);
  assert.equal(s.flags.restricted, true);
  E.simulateMonth(s);
  assert.ok(s.last.limites.includes('basileia'));
  assert.equal(A.extraDividend(s, 1000).ok, false);
});

test('falta de caixa vira venda de ativos e, em último caso, redesconto', () => {
  const s = E.newGame({ seed: 6 });
  s.stocks = 1e6;
  const need = s.cash + s.lft + s.ltn.value + s.stocks + 5e6;
  s.cash -= need;
  E.ensureLiquidity(s, null, 0);
  assert.ok(s.cash >= -1e-6);
  assert.equal(s.lft, 0);
  assert.equal(s.stocks, 0);
  assert.ok(s.redesconto > 0);
  assert.ok(s.acc.mercado > 0, 'venda forçada de ações tem custo');
});

test('teto regulatório limita a taxa do cartão', () => {
  const s = E.newGame({ seed: 8 });
  E.addModifier(s, { kind: 'rateCap', product: 'cartao', value: 45, months: 12 });
  const cap = s.eco.selic + 45;
  assert.equal(A.setRate(s, 'cartao', cap + 10).ok, false);
  assert.ok(A.setRate(s, 'cartao', cap - 1).ok);
});

test('dissídio acontece em setembro e conquistas são registradas', () => {
  const s = E.newGame({ seed: 12 });
  let sawDissidio = false;
  for (let i = 0; i < 24; i++) {
    if (s.pendingEvent && s.pendingEvent.id === 'dissidio') {
      sawDissidio = true;
      assert.equal(E.calMonth(s.month), 9);
    }
    resolvePending(s);
    competent(s);
    E.simulateMonth(s);
  }
  assert.ok(sawDissidio);
  assert.ok(s.achievements.lucro != null, 'primeiro lucro');
  assert.ok(s.salaryIndex > 1);
});

test('equilíbrio: gestão competente sobrevive e gestão imprudente quebra', () => {
  let survived = 0;
  let broke = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const good = play({ seed, scenario: 'regional' }, 120, competent);
    if (!good.over) survived++;
    const bad = play({ seed, scenario: 'regional' }, 60, reckless, 'last');
    if (bad.over) broke++;
  }
  assert.ok(survived >= 5, `gestão competente sobreviveu em ${survived}/6`);
  assert.ok(broke >= 5, `gestão imprudente quebrou em ${broke}/6`);
});

test('formatação em pt-BR', () => {
  const U = BG.U;
  assert.equal(U.fmtMoney(1250000000), 'R$ 1,25 bi');
  assert.equal(U.fmtMoney(850300000), 'R$ 850,3 mi');
  assert.equal(U.fmtMoney(12400), 'R$ 12,4 mil');
  assert.equal(U.fmtMoney(-2500000), '−R$ 2,5 mi');
  assert.equal(U.fmtMoney(5.59), 'R$ 5,59');
  assert.equal(U.fmtPct(10.5), '10,5%');
  assert.equal(U.monthLabel(-1, 2027), 'Dez/26');
  assert.equal(U.monthLabel(13, 2027), 'Fev/28');
});
