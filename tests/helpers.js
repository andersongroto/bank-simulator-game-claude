// Carrega o motor do jogo no Node (os scripts registram tudo em globalThis.BankGame).
const path = require('path');

for (const f of ['util', 'config', 'economy', 'engine', 'events']) {
  require(path.join(__dirname, '..', 'js', f + '.js'));
}
const BG = globalThis.BankGame;
const E = BG.Engine;
const A = E.actions;

// Custos já pagos que só entram na DRE do próximo fechamento.
function pendingAcc(s) {
  return s.acc.pessoal + s.acc.marketing + s.acc.outras + s.acc.mercado + s.acc.dividends - s.acc.capital;
}

// Estratégia de referência: mantém equipe adequada, taxas de mercado e investe com folga de capital.
function competent(s) {
  const m = E.metrics(s);
  const want = {
    atendimento: Math.ceil(E.idealAttendants(s) * 1.05),
    gerentes: Math.ceil(E.idealManagers(s)),
    analistas: Math.ceil(((s.last ? s.last.demandaTotal : 0) / (BG.CONFIG.ANALYST_CAPACITY * s.P * (1 + 0.1 * s.tech.credito.level))) * 1.1) + 1,
    ti: E.requiredTI(s) + 1,
  };
  for (const r of BG.ROLE_KEYS) {
    const d = want[r] - s.staff[r];
    if (d > 0) A.hire(s, r, d);
  }
  for (const k of BG.PRODUCT_KEYS) A.setRate(s, k, E.marketRate(s, k));
  if (m.basel < 12.5 && !s.flags.restricted) A.issueShares(s, m.equity * 0.3);
  if (m.basel < 11) { A.issueShares(s, m.equity * 0.5); A.setCdbPct(s, 95); } else if (m.basel > 14) A.setCdbPct(s, 100);
  if (m.basel > 16) {
    for (const k of ['app', 'credito', 'core', 'seguranca', 'compliance']) {
      const t = s.tech[k];
      if (!t.building && t.level < 5 && BG.TECH[k].costs[t.level] * s.P < m.equity * 0.15) A.startUpgrade(s, k);
    }
    if (s.customers / Math.max(1, s.branches) > 14000 && 3e6 * s.P < m.equity * 0.05) A.openBranch(s);
  }
  A.setMarketing(s, Math.max(100000 * s.P, m.assets * 0.0003));
}

// Estratégia imprudente: crédito barato, aprovação agressiva e captação cara.
function reckless(s) {
  for (const k of BG.PRODUCT_KEYS) {
    A.setRate(s, k, E.marketRate(s, k) * 0.8);
    A.setPolicy(s, k, 'agressiva');
  }
  A.setCdbPct(s, 125);
}

function resolvePending(s, pick = 'first') {
  let guard = 0;
  while (s.pendingEvent && guard++ < 5) {
    const cur = BG.Events.current(s);
    const av = cur.choices.filter((c) => c.available);
    const choice = pick === 'last' ? av[av.length - 1] : pick === 'random' ? av[Math.floor(Math.random() * av.length)] : av[0];
    BG.Events.resolve(s, choice.index);
  }
}

function play(opts, months, strategy, pick) {
  const s = E.newGame(opts);
  for (let i = 0; i < months && !s.over; i++) {
    resolvePending(s, pick);
    if (strategy) strategy(s);
    E.simulateMonth(s);
  }
  return s;
}

module.exports = { BG, E, A, pendingAcc, competent, reckless, resolvePending, play };
