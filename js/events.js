/* Eventos: decisões (pausam o jogo até você escolher) e notícias (efeito imediato). */
(function (G) {
  'use strict';
  const BG = (G.BankGame = G.BankGame || {});
  const U = BG.U;
  const { clamp, chance, range, randInt, rand } = U;
  const E = () => BG.Engine;
  const money = U.fmtMoney;
  const pct = U.fmtPct;

  // ---------- Atalhos ----------
  const lvl = (s, k) => s.tech[k].level;
  const met = (s) => E().metrics(s);
  const big = (s, share, minReal) => Math.max(minReal * s.P, share * met(s).assets);
  const rep = (s, d) => { s.reputation = clamp(s.reputation + d, 1, 99); };
  const sat = (s, d) => { s.satisfaction = clamp(s.satisfaction + d, 1, 99); };
  const mod = (s, o) => E().addModifier(s, o);
  const spend = (s, amount, label) => E().spend(s, amount, 'outras', label);
  const pickOne = (s, arr) => arr[Math.floor(rand(s) * arr.length)];
  const aggressiveCount = (s) => BG.PRODUCT_KEYS.filter((k) => s.products[k].policy === 'agressiva').length;

  const EVENTS = [];
  const def = (ev) => EVENTS.push(ev);

  // ======================================================================
  // Decisões
  // ======================================================================
  def({
    id: 'hacker', title: 'Ataque hacker', tone: 'bad', cooldown: 18, minMonth: 3,
    weight: (s) => 0.9 * (1 - 0.15 * lvl(s, 'seguranca')),
    init: (s) => ({ ransom: big(s, 0.0025, 400000) }),
    text: (s, p) => `Um grupo criminoso invadiu servidores do banco e criptografou parte dos sistemas. Eles exigem ${money(p.ransom)} em criptomoedas para devolver o acesso. Sua segurança cibernética está no nível ${lvl(s, 'seguranca')}.`,
    choices: [
      {
        label: 'Pagar o resgate',
        hint: (s, p) => `Custa ${money(p.ransom)}. Rápido, mas nada garante que os dados não vazem.`,
        apply: (s, p) => {
          spend(s, p.ransom, 'Resgate de ataque hacker');
          rep(s, -3);
          if (chance(s, 0.3 * (1 - 0.12 * lvl(s, 'seguranca')))) {
            rep(s, -5); sat(s, -4);
            return 'Mesmo com o pagamento, os criminosos vazaram dados de clientes.';
          }
          return 'Os sistemas foram liberados e voltaram a funcionar.';
        },
      },
      {
        label: 'Recusar e restaurar os backups',
        hint: (s, p) => `Custa cerca de ${money(p.ransom * Math.max(0.15, 0.6 - 0.08 * lvl(s, 'seguranca')))} e deixa o app instável por semanas.`,
        apply: (s, p) => {
          spend(s, p.ransom * Math.max(0.15, 0.6 - 0.08 * lvl(s, 'seguranca')), 'Recuperação de sistemas');
          mod(s, { id: 'hacker', kind: 'satisfaction', value: -(12 - 2 * lvl(s, 'seguranca')), months: 2, label: 'Sistemas instáveis após ataque' });
          rep(s, -2);
          return 'Os sistemas foram restaurados aos poucos. Clientes reclamaram da instabilidade.';
        },
      },
      {
        label: 'Contratar especialistas em resposta a incidentes',
        hint: (s, p) => `Custa ${money(p.ransom * 0.9)}. Recuperação rápida e transparente.`,
        apply: (s, p) => {
          spend(s, p.ransom * 0.9, 'Resposta a incidente');
          mod(s, { id: 'hacker', kind: 'satisfaction', value: -4, months: 1, label: 'Instabilidade após ataque' });
          rep(s, 1);
          return 'Sistemas restaurados em 48 horas. A imprensa elogiou a transparência do banco.';
        },
      },
      {
        label: 'Acionar o plano de contingência',
        hint: (s, p) => `Exige segurança nível 3. Custa só ${money(p.ransom * 0.1)}.`,
        available: (s) => lvl(s, 'seguranca') >= 3,
        apply: (s, p) => {
          spend(s, p.ransom * 0.1, 'Plano de contingência');
          rep(s, 1);
          return 'O ataque foi contido pelo centro de operações de segurança. Clientes nem perceberam.';
        },
      },
    ],
  });

  def({
    id: 'fraude', title: 'Fraude interna', tone: 'bad', cooldown: 24, minMonth: 4,
    weight: (s) => 0.6 * (1 - 0.15 * lvl(s, 'compliance')),
    init: (s) => ({ amount: big(s, 0.0015, 300000) }),
    text: (s, p) => `A auditoria descobriu que um gerente desviou ${money(p.amount)} de contas de clientes ao longo de meses. Os clientes precisam ser ressarcidos e a decisão sobre como lidar com o caso é sua.`,
    choices: [
      {
        label: 'Denunciar à polícia e ressarcir publicamente',
        hint: 'Arranha a imagem agora, mas mostra seriedade.',
        apply: (s, p) => {
          spend(s, p.amount, 'Ressarcimento de fraude');
          rep(s, -3);
          mod(s, { id: 'fraude-transp', kind: 'reputation', value: 3, months: 12, label: 'Transparência no caso de fraude' });
          return 'O caso virou notícia, mas a postura firme foi bem recebida.';
        },
      },
      {
        label: 'Ressarcir em silêncio e abafar o caso',
        hint: (s) => `Risco de vazamento de ${pct((0.4 - 0.05 * lvl(s, 'compliance')) * 100, 0)}.`,
        apply: (s, p) => {
          spend(s, p.amount, 'Ressarcimento de fraude');
          if (chance(s, 0.4 - 0.05 * lvl(s, 'compliance'))) {
            rep(s, -12);
            mod(s, { id: 'fraude-escandalo', kind: 'reputation', value: -4, months: 12, label: 'Escândalo de fraude abafada' });
            return 'Um jornal descobriu a fraude abafada. Escândalo nacional.';
          }
          return 'O caso não vazou. Por enquanto.';
        },
      },
      {
        label: 'Acionar o seguro e o compliance',
        hint: (s, p) => `Exige compliance nível 2. Custa só ${money(p.amount * 0.3)}.`,
        available: (s) => lvl(s, 'compliance') >= 2,
        apply: (s, p) => {
          spend(s, p.amount * 0.3, 'Franquia do seguro');
          rep(s, -1);
          return 'O seguro cobriu a maior parte do prejuízo e os controles foram reforçados.';
        },
      },
    ],
  });

  def({
    id: 'dissidio', title: 'Data-base dos bancários', tone: 'neutral', scheduled: true,
    init: (s) => ({ infl: Math.max(0, s.eco.inflation), demand: Math.max(0, s.eco.inflation) + 2 }),
    text: (s, p) => `Setembro chegou. O sindicato pede reajuste de ${pct(p.demand)} (inflação de ${pct(p.infl)} + 2% de aumento real) para toda a equipe. A folha de pagamento hoje custa cerca de ${money(U.sum(BG.ROLE_KEYS, (r) => s.staff[r] * E().salary(s, r)))} por mês.`,
    choices: [
      {
        label: 'Aceitar a proposta',
        hint: 'Equipe motivada melhora o atendimento por 6 meses.',
        apply: (s, p) => {
          s.salaryIndex *= 1 + p.demand / 100;
          mod(s, { id: 'dissidio', kind: 'satisfaction', value: 3, months: 6, label: 'Equipe motivada' });
          return `Acordo fechado: reajuste de ${pct(p.demand)}.`;
        },
      },
      {
        label: 'Oferecer só a reposição da inflação',
        hint: 'Chance de greve de um mês.',
        apply: (s, p) => {
          s.salaryIndex *= 1 + p.infl / 100;
          if (chance(s, 0.45)) {
            mod(s, { id: 'greve', kind: 'origination', value: 0.75, months: 1, label: 'Greve dos bancários' });
            mod(s, { id: 'greve-sat', kind: 'satisfaction', value: -8, months: 1, label: 'Agências fechadas pela greve' });
            rep(s, -1);
            return 'Houve greve por algumas semanas antes do acordo pela inflação.';
          }
          return 'O sindicato aceitou a reposição da inflação.';
        },
      },
      {
        label: 'Recusar qualquer reajuste',
        hint: (s) => (s.eco.unemployment > 10 ? 'Com desemprego alto, o sindicato está fraco.' : 'Greve longa é provável.'),
        apply: (s, p) => {
          const weak = s.eco.unemployment > 10 ? 0.6 : 0.2;
          if (chance(s, weak)) return 'Com medo do desemprego, a categoria aceitou ficar sem reajuste.';
          mod(s, { id: 'greve', kind: 'origination', value: 0.5, months: 2, label: 'Greve dos bancários' });
          mod(s, { id: 'greve-sat', kind: 'satisfaction', value: -16, months: 2, label: 'Agências fechadas pela greve' });
          rep(s, -4);
          s.salaryIndex *= 1 + p.infl / 100;
          return 'Greve de dois meses. No fim, a Justiça do Trabalho impôs a reposição da inflação.';
        },
      },
    ],
  });

  def({
    id: 'fintech', title: 'Nova fintech no mercado', tone: 'bad', cooldown: 30, minMonth: 6,
    weight: 0.5,
    init: (s) => ({ price: big(s, 0.04, 10000000), customers: randInt(s, 25, 60) * 1000 }),
    text: (s, p) => `A fintech Pulsar chegou com conta grátis e CDB de 120% do CDI. Ela já tem ${U.fmtNum(p.customers)} clientes e está roubando os seus. Os fundadores aceitariam vender a empresa por ${money(p.price)}.`,
    choices: [
      {
        label: 'Comprar a Pulsar',
        hint: (s, p) => `Custa ${money(p.price)}. Traz os clientes, elimina a ameaça e, se o seu app estiver abaixo do nível 3, sobe um nível.`,
        available: (s, p) => E().availableCash(s) >= p.price,
        apply: (s, p) => {
          E().pay(s, p.price);
          s.fixed += p.price;
          s.customers += p.customers;
          const dep = p.customers * 800 * s.P;
          s.deposits.checking += dep;
          s.cash += dep;
          const t = s.tech.app;
          if (t.level < 3 && !t.building) {
            t.level++;
            return `Compra concluída: +${U.fmtNum(p.customers)} clientes e a tecnologia da Pulsar levou o app ao nível ${t.level}.`;
          }
          return `Compra concluída: +${U.fmtNum(p.customers)} clientes.`;
        },
      },
      {
        label: 'Responder com campanha de marketing',
        hint: (s) => `Custa ${money(1500000 * s.P)}. Reduz o impacto pela metade.`,
        apply: (s) => {
          E().spend(s, 1500000 * s.P, 'marketing', 'Campanha contra a Pulsar');
          s.awareness = clamp(s.awareness + 0.04, 0, 0.97);
          mod(s, { id: 'fintech-acq', kind: 'acquisition', value: 0.88, months: 6, label: 'Concorrência da Pulsar' });
          mod(s, { id: 'fintech-cdb', kind: 'cdbMarket', value: 0.03, months: 6, label: 'CDB agressivo da Pulsar' });
          return 'A campanha segurou parte dos clientes.';
        },
      },
      {
        label: 'Ignorar',
        hint: 'Menos clientes novos e CDB de mercado mais alto por 6 meses.',
        apply: (s) => {
          mod(s, { id: 'fintech-acq', kind: 'acquisition', value: 0.72, months: 6, label: 'Concorrência da Pulsar' });
          mod(s, { id: 'fintech-cdb', kind: 'cdbMarket', value: 0.06, months: 6, label: 'CDB agressivo da Pulsar' });
          mod(s, { id: 'fintech-churn', kind: 'churn', value: 0.003, months: 6, label: 'Clientes migrando para a Pulsar' });
          return 'A Pulsar segue crescendo às suas custas.';
        },
      },
    ],
  });

  def({
    id: 'aquisicao', title: 'Banco à venda', tone: 'good', cooldown: 36, minMonth: 12,
    weight: (s) => (met(s).basel > 14 ? 0.4 : 0.1),
    init: (s) => {
      const cust = Math.max(5000, Math.round((s.customers * range(s, 0.15, 0.4)) / 100) * 100);
      const L = cust * 9000 * s.P;
      const D = cust * 13000 * s.P;
      const br = randInt(s, 1, 3);
      const F = br * BG.CONFIG.BRANCH.book * s.P;
      const Et = 0.13 * L;
      return { cust, L, D, br, F, Et, price: Et * range(s, 0.9, 1.5), risk: range(s, 0.85, 1.9), dd: false };
    },
    text: (s, p) => {
      let t = `O Banco do Vale está à venda: ${U.fmtNum(p.cust)} clientes, ${p.br} agência(s), carteira de crédito de ${money(p.L)} e depósitos de ${money(p.D)}. Patrimônio contábil de ${money(p.Et)}; os donos pedem ${money(p.price)}.`;
      if (p.dd) {
        const q = p.risk < 1.1 ? 'boa' : p.risk < 1.45 ? 'mediana' : 'ruim';
        t += ` A due diligence concluiu que a carteira é de qualidade ${q}: o risco de calote é ${U.fmtNum(p.risk, 2)} vez(es) o normal.`;
      } else {
        t += ' A qualidade real da carteira é desconhecida.';
      }
      return t;
    },
    choices: [
      {
        label: 'Comprar o Banco do Vale',
        hint: (s, p) => `Paga ${money(p.price)}; o caixa líquido do negócio é ${money(p.D + p.Et - p.L - p.F - p.price)}.`,
        available: (s, p) => E().availableCash(s) + (p.D + p.Et - p.L - p.F) >= p.price,
        apply: (s, p) => {
          const Ct = p.D + p.Et - p.L - p.F;
          s.cash += Ct;
          E().pay(s, p.price);
          const goodwill = p.price - p.Et;
          if (goodwill > 0) s.fixed += goodwill;
          else s.acc.outras += goodwill; // compra vantajosa: ganho
          s.fixed += p.F;
          s.customers += p.cust;
          s.branches += p.br;
          s.atms += p.br * 2;
          s.staff.atendimento += Math.round(p.cust / 450);
          s.staff.gerentes += Math.round(p.cust / 1350);
          s.staff.analistas += 1;
          const totalL = E().totalLoans(s) - U.sum(s.bigLoans, (b) => b.amount);
          for (const k of BG.PRODUCT_KEYS) {
            const pr = s.products[k];
            const share = totalL > 0 ? pr.balance / totalL : 1 / BG.PRODUCT_KEYS.length;
            const add = p.L * share;
            const nb = pr.balance + add;
            if (nb > 0) {
              pr.avgRate = (pr.balance * pr.avgRate + add * E().marketRate(s, k)) / nb;
              pr.risk = (pr.balance * pr.risk + add * p.risk) / nb;
            }
            pr.balance = nb;
          }
          s.deposits.checking += p.D * 0.2;
          s.deposits.savings += p.D * 0.35;
          s.deposits.cdb += p.D * 0.45;
          s.compulsory += 0;
          E().ensureLiquidity(s, null, 0);
          rep(s, 2);
          return `Aquisição concluída: +${U.fmtNum(p.cust)} clientes e +${p.br} agência(s).`;
        },
      },
      {
        label: 'Contratar due diligence',
        hint: (s) => `Custa ${money(500000 * s.P)} e revela a qualidade da carteira.`,
        available: (s, p) => !p.dd,
        apply: (s, p) => {
          spend(s, 500000 * s.P, 'Due diligence');
          p.dd = true;
          return { msg: 'Os auditores entregaram o relatório.', keep: true };
        },
      },
      { label: 'Recusar', hint: 'O banco será vendido a outro comprador.', apply: () => 'Você passou a oportunidade.' },
    ],
  });

  const COMPANIES = ['Metalúrgica Paranaense', 'Rede de Supermercados Sol', 'Construtora Alicerce', 'AgroVale Grãos', 'Transportadora Rota 116', 'Hospital Santa Clara', 'Têxtil Itajaí', 'Laticínios Serra Azul', 'Energia Ventos do Norte'];
  const GRADES = { A: { pd: 0.015, spread: 4, accept: 0.35 }, B: { pd: 0.045, spread: 7, accept: 0.55 }, C: { pd: 0.1, spread: 12, accept: 0.75 } };

  def({
    id: 'corporativo', title: 'Grande cliente corporativo', tone: 'neutral', cooldown: 8, minMonth: 2,
    weight: 0.8,
    init: (s) => {
      const grade = pickOne(s, ['A', 'A', 'B', 'B', 'C']);
      const g = GRADES[grade];
      return {
        company: pickOne(s, COMPANIES), grade,
        amount: Math.max(3000000 * s.P, 0.08 * Math.max(0, met(s).equity)),
        rate: Math.round((s.eco.selic + g.spread) * 10) / 10,
        months: randInt(s, 2, 4) * 12,
      };
    },
    text: (s, p) => `A ${p.company} pede ${money(p.amount)} por ${p.months} meses e aceita pagar ${pct(p.rate)} ao ano. Nota de risco interna: ${p.grade} (chance de calote de cerca de ${pct(GRADES[p.grade].pd * 100)} ao ano; garantias cobrem 40% da dívida).`,
    choices: [
      {
        label: 'Aprovar',
        hint: (s, p) => `Rende cerca de ${money((p.amount * p.rate) / 1200)} por mês.`,
        available: (s, p) => E().availableCash(s) >= p.amount && !s.flags.restricted,
        apply: (s, p) => {
          E().pay(s, p.amount);
          s.bigLoans.push({ name: p.company, amount: p.amount, rate: p.rate, monthsLeft: p.months, pd: GRADES[p.grade].pd, grade: p.grade });
          return `Empréstimo de ${money(p.amount)} liberado.`;
        },
      },
      {
        label: 'Contraproposta: +3 pontos na taxa',
        hint: 'Empresas mais arriscadas tendem a aceitar.',
        available: (s, p) => E().availableCash(s) >= p.amount && !s.flags.restricted,
        apply: (s, p) => {
          if (chance(s, GRADES[p.grade].accept)) {
            E().pay(s, p.amount);
            s.bigLoans.push({ name: p.company, amount: p.amount, rate: p.rate + 3, monthsLeft: p.months, pd: GRADES[p.grade].pd, grade: p.grade });
            return `A empresa aceitou ${pct(p.rate + 3)} ao ano.`;
          }
          return 'A empresa fechou com um concorrente.';
        },
      },
      { label: 'Recusar', hint: 'Sem risco, sem retorno.', apply: () => 'Proposta recusada.' },
    ],
  });

  function auditProblemChance(s) {
    return clamp(0.55 - 0.08 * lvl(s, 'compliance') + 0.08 * aggressiveCount(s), 0.05, 0.95);
  }
  def({
    id: 'fiscalizacao', title: 'Fiscalização do Banco Central', tone: 'bad', cooldown: 18, minMonth: 6,
    weight: (s) => 0.5 * auditProblemChance(s),
    init: (s) => ({ fine: big(s, 0.0015, 300000) * (1 + 0.3 * aggressiveCount(s)) }),
    text: (s, p) => `Inspetores do Banco Central encontraram falhas nos controles contra lavagem de dinheiro e na classificação de risco da carteira. Multa proposta: ${money(p.fine)}.`,
    choices: [
      {
        label: 'Pagar e assinar termo de compromisso',
        hint: (s, p) => `Desconto de 20%: ${money(p.fine * 0.8)}.`,
        apply: (s, p) => { spend(s, p.fine * 0.8, 'Multa do Banco Central'); rep(s, -1); return 'Multa paga com desconto.'; },
      },
      {
        label: 'Recorrer administrativamente',
        hint: 'Chance de 45% de reduzir a multa a 30%; se perder, paga 130%.',
        apply: (s, p) => {
          if (chance(s, 0.45)) { spend(s, p.fine * 0.3, 'Multa do Banco Central'); return 'Recurso aceito: multa reduzida.'; }
          spend(s, p.fine * 1.3, 'Multa do Banco Central');
          rep(s, -3);
          return 'Recurso negado: multa majorada e notícia nos jornais.';
        },
      },
      {
        label: 'Apresentar plano de correção imediato',
        hint: (s, p) => `Exige compliance nível 2. Paga só ${money(p.fine * 0.4)}.`,
        available: (s) => lvl(s, 'compliance') >= 2,
        apply: (s, p) => { spend(s, p.fine * 0.4, 'Multa do Banco Central'); rep(s, 1); return 'O Banco Central aceitou o plano e reduziu a multa.'; },
      },
    ],
  });

  def({
    id: 'vazamento', title: 'Vazamento de dados', tone: 'bad', cooldown: 18, minMonth: 4,
    weight: (s) => 0.5 * (1 - 0.15 * lvl(s, 'seguranca')),
    init: (s) => {
      const n = Math.round(s.customers * range(s, 0.05, 0.3));
      return { n, cost: n * 15 * s.P };
    },
    text: (s, p) => `Dados cadastrais de ${U.fmtNum(p.n)} clientes foram expostos por uma falha em um fornecedor de tecnologia. A LGPD obriga a comunicação de incidentes graves.`,
    choices: [
      {
        label: 'Comunicar clientes e a ANPD',
        hint: (s, p) => `Custa ${money(p.cost)} em monitoramento de crédito para os afetados.`,
        apply: (s, p) => {
          spend(s, p.cost, 'Resposta ao vazamento');
          rep(s, -3);
          mod(s, { id: 'vazamento', kind: 'satisfaction', value: -5, months: 2, label: 'Clientes preocupados com o vazamento' });
          return 'Incidente comunicado. Clientes ficaram apreensivos, mas confiaram na resposta.';
        },
      },
      {
        label: 'Corrigir a falha em silêncio',
        hint: 'Metade de chance de alguém descobrir.',
        apply: (s, p) => {
          if (chance(s, 0.5)) {
            spend(s, p.cost * 4, 'Multa da LGPD');
            rep(s, -12);
            mod(s, { id: 'vazamento', kind: 'satisfaction', value: -8, months: 3, label: 'Escândalo do vazamento escondido' });
            return 'Um pesquisador de segurança expôs o caso. Multa da ANPD e escândalo.';
          }
          return 'Ninguém percebeu.';
        },
      },
    ],
  });

  def({
    id: 'programaGoverno', title: 'Programa emergencial de crédito', tone: 'good', cooldown: 36,
    cond: (s) => s.eco.phase === 'recessao' || s.eco.phase === 'desaceleracao',
    weight: 0.6,
    text: () => 'Para enfrentar a crise, o governo lançou um programa de crédito para pequenas empresas com garantia do Tesouro em 70% dos empréstimos. Bancos participantes cobram taxas menores.',
    choices: [
      {
        label: 'Aderir ao programa',
        hint: 'Por 9 meses: +50% de demanda em capital de giro, risco dos novos contratos bem menor, mas taxas de mercado 20% menores.',
        apply: (s) => {
          mod(s, { id: 'pg-d', kind: 'demand', product: 'empresas', value: 1.5, months: 9, label: 'Programa emergencial de crédito' });
          mod(s, { id: 'pg-r', kind: 'newRisk', product: 'empresas', value: 0.6, months: 9 });
          mod(s, { id: 'pg-s', kind: 'marketSpread', product: 'empresas', value: 0.8, months: 9 });
          rep(s, 3);
          return 'O banco aderiu ao programa e ganhou elogios por apoiar as empresas.';
        },
      },
      { label: 'Não aderir', hint: 'Nada muda.', apply: () => 'O banco ficou de fora do programa.' },
    ],
  });

  def({
    id: 'processo', title: 'Ação coletiva de consumidores', tone: 'bad', cooldown: 24,
    cond: (s) => s.fee > BG.CONFIG.MARKET_FEE * s.P * 1.1,
    weight: 0.6,
    init: (s) => ({ amount: Math.max(200000 * s.P, s.customers * (s.fee - BG.CONFIG.MARKET_FEE * s.P) * 6 * 0.3) }),
    text: (s, p) => `Uma associação de consumidores processa o banco por tarifas abusivas (${money(s.fee)} por mês, contra ${money(BG.CONFIG.MARKET_FEE * s.P)} no mercado) e cobra ${money(p.amount)}.`,
    choices: [
      { label: 'Fazer acordo', hint: (s, p) => `Paga ${money(p.amount * 0.6)}.`, apply: (s, p) => { spend(s, p.amount * 0.6, 'Acordo judicial'); rep(s, -1); return 'Acordo homologado.'; } },
      {
        label: 'Ir a julgamento',
        hint: 'Chance de 40% de vitória; se perder, paga 140%.',
        apply: (s, p) => {
          spend(s, p.amount * 0.05, 'Custas judiciais');
          if (chance(s, 0.4)) { rep(s, 1); return 'O banco venceu na Justiça.'; }
          spend(s, p.amount * 1.4, 'Condenação judicial');
          rep(s, -4);
          return 'Condenado. A decisão virou manchete.';
        },
      },
      {
        label: 'Acordo e tarifa no preço de mercado',
        hint: (s, p) => `Paga ${money(p.amount * 0.5)} e reduz a tarifa para ${money(BG.CONFIG.MARKET_FEE * s.P)}.`,
        apply: (s, p) => {
          spend(s, p.amount * 0.5, 'Acordo judicial');
          s.fee = Math.round(BG.CONFIG.MARKET_FEE * s.P * 10) / 10;
          rep(s, 2);
          return 'Acordo fechado e tarifa reduzida. Os clientes aprovaram.';
        },
      },
    ],
  });

  const FUNDS = ['Atlântico Capital', 'Southern Cross Partners', 'Fundo Soberano de Cingapura', 'Andes Private Equity', 'Nordic Pension Fund'];
  def({
    id: 'investidor', title: 'Investidor quer entrar no banco', tone: 'good', cooldown: 30, minMonth: 24,
    cond: (s) => met(s).equity > 80e6 * s.P && met(s).ni12 > 0,
    weight: 0.35,
    init: (s) => {
      const m = met(s);
      return { fund: pickOne(s, FUNDS), amount: m.equity * range(s, 0.2, 0.5), premium: range(s, 1.1, 1.3) };
    },
    text: (s, p) => {
      const m = met(s);
      const price = m.sharePrice * p.premium;
      const n = p.amount / price;
      const own = s.shares.player / (s.shares.total + n);
      return `O ${p.fund} quer aportar ${money(p.amount)} comprando ações novas a ${money(price)} cada, ${pct((p.premium - 1) * 100, 0)} acima da avaliação atual. Sua participação cairia de ${pct((s.shares.player / s.shares.total) * 100)} para ${pct(own * 100)}.`;
    },
    choices: [
      {
        label: 'Aceitar o aporte',
        hint: 'Mais capital para crescer, menos participação para você.',
        apply: (s, p) => {
          const m = met(s);
          const n = p.amount / (m.sharePrice * p.premium);
          s.shares.total += n;
          s.cash += p.amount;
          s.acc.capital += p.amount;
          rep(s, 2);
          return `Aporte de ${money(p.amount)} concluído.`;
        },
      },
      { label: 'Recusar', hint: 'Você mantém o controle.', apply: () => 'Proposta recusada.' },
    ],
  });

  const CLUBS = ['Esporte Clube Tamanduá', 'Atlético Serrano', 'União Litorânea FC', 'Sociedade Esportiva Ipiranga do Sul'];
  def({
    id: 'patrocinio', title: 'Proposta de patrocínio', tone: 'good', cooldown: 24, minMonth: 6,
    weight: 0.35,
    init: (s) => ({ club: pickOne(s, CLUBS), cost: Math.max(4000000 * s.P, 0.006 * met(s).assets) }),
    text: (s, p) => `O ${p.club}, que acabou de subir para a primeira divisão, oferece o patrocínio master da camisa por uma temporada por ${money(p.cost)}.`,
    choices: [
      {
        label: 'Fechar o patrocínio',
        hint: 'Grande salto de reconhecimento de marca.',
        available: (s, p) => E().availableCash(s) >= p.cost,
        apply: (s, p) => {
          E().spend(s, p.cost, 'marketing', 'Patrocínio de futebol');
          s.awareness = clamp(s.awareness + 0.18 * (1 - s.awareness * 0.5), 0, 0.97);
          rep(s, 3);
          return 'A marca do banco estará na camisa em todos os jogos.';
        },
      },
      { label: 'Recusar', hint: 'Sem custo.', apply: () => 'Outro banco fechou o patrocínio.' },
    ],
  });

  def({
    id: 'golpes', title: 'Onda de golpes contra clientes', tone: 'bad', cooldown: 18, minMonth: 3,
    weight: (s) => 0.6 * (1 - 0.12 * lvl(s, 'seguranca')),
    init: (s) => {
      const n = Math.max(20, Math.round(s.customers * range(s, 0.002, 0.008)));
      return { n, amount: n * 1800 * s.P * (1 - 0.12 * lvl(s, 'seguranca')) };
    },
    text: (s, p) => `Uma quadrilha aplicou o golpe do falso atendente em ${U.fmtNum(p.n)} clientes, que perderam ${money(p.amount)} via PIX. Eles pedem ressarcimento.`,
    choices: [
      {
        label: 'Ressarcir todos',
        hint: (s, p) => `Custa ${money(p.amount)}. Clientes satisfeitos por 6 meses.`,
        apply: (s, p) => {
          spend(s, p.amount, 'Ressarcimento de golpes');
          mod(s, { id: 'golpes', kind: 'satisfaction', value: 4, months: 6, label: 'Ressarcimento das vítimas de golpe' });
          rep(s, 2);
          return 'Todos os clientes foram ressarcidos.';
        },
      },
      {
        label: 'Analisar caso a caso',
        hint: (s, p) => `Custa cerca de ${money(p.amount * 0.4)}.`,
        apply: (s, p) => {
          spend(s, p.amount * 0.4, 'Ressarcimento de golpes');
          mod(s, { id: 'golpes', kind: 'satisfaction', value: -3, months: 2, label: 'Reclamações sobre golpes' });
          return 'Parte dos clientes foi ressarcida.';
        },
      },
      {
        label: 'Negar ressarcimento',
        hint: 'Risco de multa do Procon e clientes revoltados.',
        apply: (s, p) => {
          mod(s, { id: 'golpes', kind: 'satisfaction', value: -8, months: 4, label: 'Vítimas de golpe sem ressarcimento' });
          rep(s, -4);
          if (chance(s, 0.4)) { spend(s, p.amount * 0.5, 'Multa do Procon'); return 'O Procon multou o banco.'; }
          return 'Os clientes lotaram o Reclame Aqui.';
        },
      },
    ],
  });

  const EXECS = [
    { name: 'Helena Prado', role: 'Diretora de Riscos', effect: 'risk', value: 0.88, desc: 'reduz em 12% o risco dos novos empréstimos' },
    { name: 'Rafael Monteiro', role: 'Diretor de Riscos', effect: 'risk', value: 0.88, desc: 'reduz em 12% o risco dos novos empréstimos' },
    { name: 'Camila Duarte', role: 'Diretora Comercial', effect: 'demand', value: 1.12, desc: 'aumenta em 12% a demanda por crédito' },
    { name: 'Otávio Nakamura', role: 'Diretor Comercial', effect: 'demand', value: 1.12, desc: 'aumenta em 12% a demanda por crédito' },
  ];
  def({
    id: 'executivo', title: 'Executivo disponível', tone: 'good', cooldown: 24, minMonth: 6,
    cond: (s) => s.executives.length < 2,
    weight: 0.4,
    init: (s) => {
      const opts = EXECS.filter((x) => !s.executives.some((e) => e.effect === x.effect));
      const ex = pickOne(s, opts.length ? opts : EXECS);
      return Object.assign({}, ex, { salary: 120000 });
    },
    text: (s, p) => `${p.name}, executivo(a) renomado(a) do mercado, aceita ser ${p.role} do banco. Salário de ${money(p.salary * s.P)} por mês e bônus de contratação de ${money(p.salary * 3 * s.P)}. Efeito: ${p.desc}.`,
    choices: [
      {
        label: 'Contratar',
        hint: 'Demitir depois custa 6 salários.',
        apply: (s, p) => {
          E().spend(s, p.salary * 3 * s.P, 'pessoal', 'Bônus de contratação');
          s.executives.push({ name: p.name, role: p.role, effect: p.effect, value: p.value, salary: p.salary, desc: p.desc });
          rep(s, 1);
          return `${p.name} assumiu como ${p.role}.`;
        },
      },
      { label: 'Recusar', hint: 'Sem custo.', apply: () => 'O executivo foi para um concorrente.' },
    ],
  });

  function bankRun(s, w) {
    const d = s.deposits;
    const out = d.checking * w * 1.2 + d.savings * w + d.cdb * w * 0.8;
    d.checking -= d.checking * w * 1.2;
    d.savings -= d.savings * w;
    d.cdb -= d.cdb * w * 0.8;
    s.cash -= out;
    s.customers *= 1 - w * 0.3;
    E().ensureLiquidity(s, null, 0);
    return out;
  }
  def({
    id: 'corrida', title: 'Corrida bancária', tone: 'bad', cooldown: 12, forced: true,
    cond: (s) => s.reputation < 22 || (s.redesconto > 0 && s.reputation < 35),
    weight: 0,
    init: (s) => ({ w: clamp(0.25 - s.reputation / 200, 0.08, 0.25) }),
    text: (s, p) => `Boatos nas redes sociais dizem que o banco vai quebrar. Filas se formam e o app registra saques recordes. Analistas estimam que até ${pct(p.w * 100, 0)} dos depósitos podem sair este mês.`,
    choices: [
      {
        label: 'Garantir publicamente os depósitos',
        hint: (s) => `Campanha de ${money(1000000 * s.P)} lembrando a cobertura do FGC. Metade dos saques.`,
        apply: (s, p) => {
          E().spend(s, 1000000 * s.P, 'marketing', 'Campanha de confiança');
          const out = bankRun(s, p.w * 0.5);
          rep(s, 1);
          return `Saques de ${money(out)} antes de a situação se acalmar.`;
        },
      },
      {
        label: 'Elevar o CDB para 125% do CDI',
        hint: 'Segura o dinheiro com uma captação cara. Você pode baixar a taxa depois.',
        apply: (s, p) => {
          s.cdbPct = Math.max(s.cdbPct, 125);
          const out = bankRun(s, p.w * 0.35);
          return `Saques de ${money(out)}. O CDB agora paga ${s.cdbPct}% do CDI.`;
        },
      },
      {
        label: 'Não comentar',
        hint: 'O pânico se espalha.',
        apply: (s, p) => {
          const out = bankRun(s, p.w * 1.2);
          rep(s, -5);
          return `Saques de ${money(out)}. O silêncio alimentou o pânico.`;
        },
      },
    ],
  });

  def({
    id: 'carteiraVenda', title: 'Carteira de consignado à venda', tone: 'good', cooldown: 18, minMonth: 8,
    weight: 0.35,
    init: (s) => {
      const amount = Math.max(10e6 * s.P, 0.1 * met(s).loans);
      return { amount, rate: Math.round((E().marketRate(s, 'consignado') - 1) * 10) / 10, price: amount * 1.02 };
    },
    text: (s, p) => `O Banco Ipê precisa de liquidez e oferece uma carteira de consignado de ${money(p.amount)} com taxa média de ${pct(p.rate)} ao ano, por ${money(p.price)} (ágio de 2%).`,
    choices: [
      {
        label: 'Comprar a carteira',
        hint: 'Receita de juros imediata com risco baixo.',
        available: (s, p) => E().availableCash(s) >= p.price && !s.flags.restricted,
        apply: (s, p) => {
          E().pay(s, p.price);
          s.acc.outras += p.price - p.amount;
          const pr = s.products.consignado;
          const nb = pr.balance + p.amount;
          pr.avgRate = (pr.balance * pr.avgRate + p.amount * p.rate) / nb;
          pr.risk = (pr.balance * pr.risk + p.amount * 0.9) / nb;
          pr.balance = nb;
          return `Carteira de ${money(p.amount)} incorporada.`;
        },
      },
      { label: 'Recusar', hint: 'Sem custo.', apply: () => 'O Banco Ipê vendeu a carteira para outro banco.' },
    ],
  });

  def({
    id: 'securitizacao', title: 'Fundo quer comprar sua carteira', tone: 'neutral', cooldown: 18, minMonth: 6,
    cond: (s) => s.products.pessoal.balance + s.products.cartao.balance > 5e6 * s.P,
    weight: (s) => (met(s).basel < 13 || s.redesconto > 0 ? 1.2 : 0.2),
    init: (s) => {
      const amount = 0.3 * (s.products.pessoal.balance + s.products.cartao.balance);
      return { amount, price: amount * 0.94 };
    },
    text: (s, p) => `Um fundo de crédito oferece ${money(p.price)} por 30% das carteiras de crédito pessoal e cartão (valor contábil de ${money(p.amount)}). Vender libera caixa e capital, mas com deságio de 6%.`,
    choices: [
      {
        label: 'Vender a carteira',
        hint: (s, p) => `Perda contábil de ${money(p.amount - p.price)}; libera ${money(p.price)} em caixa e reduz os ativos de risco.`,
        apply: (s, p) => {
          s.products.pessoal.balance *= 0.7;
          s.products.cartao.balance *= 0.7;
          s.cash += p.price;
          s.acc.outras += p.amount - p.price;
          return `Carteira vendida por ${money(p.price)}.`;
        },
      },
      { label: 'Recusar', hint: 'Mantém a carteira.', apply: () => 'Proposta recusada.' },
    ],
  });

  // ======================================================================
  // Notícias (efeito imediato)
  // ======================================================================
  def({
    id: 'fiscalizacaoOk', title: 'Inspeção do Banco Central', tone: 'good', cooldown: 18, minMonth: 6,
    weight: (s) => 0.5 * (1 - auditProblemChance(s)),
    apply: (s) => { rep(s, 2); return 'os inspetores não encontraram irregularidades.'; },
  });
  def({
    id: 'viral', title: 'Viralizou', tone: 'good', cooldown: 12, cond: (s) => lvl(s, 'app') >= 1,
    weight: 0.4,
    apply: (s) => {
      s.awareness = clamp(s.awareness + 0.04 + 0.01 * lvl(s, 'app'), 0, 0.97);
      rep(s, 2);
      return 'um influenciador com milhões de seguidores elogiou o app do banco e os downloads dispararam.';
    },
  });
  def({
    id: 'premio', title: 'Prêmio de inovação', tone: 'good', cooldown: 24, cond: (s) => lvl(s, 'app') >= 3,
    weight: 0.4,
    apply: (s) => { rep(s, 4); s.awareness = clamp(s.awareness + 0.03, 0, 0.97); return 'o app do banco foi eleito o melhor do ano por uma revista de tecnologia.'; },
  });
  def({
    id: 'crise', title: 'Crise financeira global', tone: 'bad', cooldown: 84, minMonth: 18,
    cond: (s) => s.eco.phase !== 'recessao',
    weight: (s) => 0.12 * BG.DIFFICULTY[s.meta.difficulty].recession,
    apply: (s) => {
      s.eco.phase = 'recessao';
      s.eco.phaseMonths = 0;
      s.eco.stock *= 0.8;
      s.eco.gdp -= 1.5;
      mod(s, { id: 'crise-gdp', kind: 'gdpShock', value: -2, months: 4 });
      mod(s, { id: 'crise-def', kind: 'default', product: 'all', value: 1.3, months: 12, label: 'Crise global: calotes em alta' });
      mod(s, { id: 'crise-cdb', kind: 'cdbMarket', value: 0.04, months: 6, label: 'Crise global: captação mais cara' });
      mod(s, { id: 'crise-stk', kind: 'stockShock', value: -0.01, months: 3 });
      mod(s, { id: 'crise-inf', kind: 'inflShock', value: 1, months: 3 });
      return 'a quebra de um grande banco americano espalhou pânico pelos mercados. A bolsa despencou e o país entrou em recessão.';
    },
  });
  def({
    id: 'boomImob', title: 'Boom imobiliário', tone: 'good', cooldown: 36,
    cond: (s) => s.eco.phase !== 'recessao',
    weight: 0.25,
    apply: (s) => {
      mod(s, { id: 'boom-imob', kind: 'demand', product: 'imobiliario', value: 1.8, months: 12, label: 'Boom imobiliário' });
      return 'lançamentos de imóveis batem recorde. A procura por financiamento imobiliário deve quase dobrar por um ano.';
    },
  });
  def({
    id: 'compulsorio', title: 'Mudança no compulsório', tone: 'neutral', cooldown: 36, minMonth: 12,
    weight: 0.25,
    apply: (s) => {
      const up = s.eco.inflation > 5;
      mod(s, { id: 'compulsorio', kind: 'compulsory', value: up ? 0.05 : -0.05, months: 18, label: up ? 'Compulsório sobre depósitos à vista elevado' : 'Compulsório sobre depósitos à vista reduzido' });
      return up
        ? 'para conter a inflação, o Banco Central elevou em 5 pontos o recolhimento compulsório sobre depósitos à vista por 18 meses.'
        : 'para estimular o crédito, o Banco Central reduziu em 5 pontos o recolhimento compulsório sobre depósitos à vista por 18 meses.';
    },
  });
  def({
    id: 'pandemia', title: 'Pandemia', tone: 'bad', once: true, minMonth: 30,
    weight: 0.04,
    apply: (s) => {
      const app = lvl(s, 'app');
      s.eco.phase = 'recessao';
      s.eco.phaseMonths = 0;
      s.eco.stock *= 0.75;
      mod(s, { id: 'pand-gdp', kind: 'gdpShock', value: -4, months: 3 });
      mod(s, { id: 'pand-def', kind: 'default', product: 'all', value: 1.4, months: 12, label: 'Pandemia: calotes em alta' });
      mod(s, { id: 'pand-card', kind: 'demand', product: 'cartao', value: 0.7, months: 6, label: 'Pandemia: consumo em queda' });
      mod(s, { id: 'pand-acq', kind: 'acquisition', value: app >= 3 ? 1.2 : 0.8, months: 6, label: app >= 3 ? 'Pandemia: corrida para o digital' : 'Pandemia: agências fechadas' });
      if (app < 3) mod(s, { id: 'pand-sat', kind: 'satisfaction', value: -(8 - 2 * app), months: 4, label: 'Pandemia: atendimento precário' });
      return app >= 3
        ? 'uma pandemia fechou as agências. Seu app robusto atraiu clientes de outros bancos, mas a economia afundou.'
        : 'uma pandemia fechou as agências. Sem um app robusto, os clientes sofreram e a economia afundou.';
    },
  });
  def({
    id: 'falhaSistema', title: 'Falha nos sistemas', tone: 'bad', cooldown: 6,
    weight: (s) => 0.15 + 0.9 * Math.max(0, 1 - s.staff.ti / E().requiredTI(s)) + 0.1 * Math.max(0, 2 - lvl(s, 'core')),
    apply: (s) => {
      spend(s, big(s, 0.0003, 100000), 'Correção de falha de sistema');
      mod(s, { id: 'falha', kind: 'satisfaction', value: -8, months: 1, label: 'Falha nos sistemas' });
      return 'um erro no sistema duplicou transferências PIX por algumas horas. Clientes ficaram furiosos.';
    },
  });
  def({
    id: 'lumenCdb', title: 'Concorrência na captação', tone: 'bad', cooldown: 18,
    weight: 0.35,
    apply: (s) => {
      mod(s, { id: 'lumen-cdb', kind: 'cdbMarket', value: 0.05, months: 5, label: 'CDB de 115% do Lumen Bank' });
      return 'o Lumen Bank lançou um CDB de 115% do CDI com liquidez diária. A referência de mercado subiu.';
    },
  });
  def({
    id: 'fusao', title: 'Fusão no setor', tone: 'neutral', once: true, minMonth: 36,
    cond: (s) => s.competitors.some((c) => c.id === 'ipe') && s.competitors.some((c) => c.id === 'araucaria'),
    weight: 0.15,
    apply: (s) => {
      const ipe = s.competitors.find((c) => c.id === 'ipe');
      const ar = s.competitors.find((c) => c.id === 'araucaria');
      ipe.assets += ar.assets;
      ipe.customers += ar.customers;
      s.competitors = s.competitors.filter((c) => c.id !== 'araucaria');
      return 'o Banco Ipê comprou a Cooperativa Araucária e ficou ainda maior.';
    },
  });
  def({
    id: 'pix', title: 'Novidade no PIX', tone: 'neutral', cooldown: 36,
    weight: 0.3,
    apply: (s) => {
      if (lvl(s, 'app') >= 3) {
        mod(s, { id: 'pix', kind: 'acquisition', value: 1.15, months: 6, label: 'App pronto para o novo PIX' });
        return 'o Banco Central lançou o PIX parcelado. Seu app saiu na frente e atraiu clientes.';
      }
      mod(s, { id: 'pix', kind: 'satisfaction', value: -4, months: 4, label: 'App sem o novo PIX' });
      return 'o Banco Central lançou o PIX parcelado. Seu app ainda não oferece a função e os clientes reclamam.';
    },
  });
  def({
    id: 'tetoJuros', title: 'Teto para juros do cartão', tone: 'bad', cooldown: 120, minMonth: 24,
    weight: 0.12,
    apply: (s) => {
      mod(s, { id: 'teto-cartao', kind: 'rateCap', product: 'cartao', value: 45, months: 24, label: 'Teto de juros do cartão' });
      mod(s, { id: 'teto-mkt', kind: 'marketSpread', product: 'cartao', value: 0.72, months: 24 });
      return 'o Congresso aprovou um teto de Selic + 45 pontos para os juros do cartão por dois anos.';
    },
  });
  def({
    id: 'choqueInflacao', title: 'Choque inflacionário', tone: 'bad', cooldown: 36, minMonth: 6,
    weight: 0.25,
    apply: (s) => {
      mod(s, { id: 'choque-inf', kind: 'inflShock', value: 2, months: 4 });
      mod(s, { id: 'choque-stk', kind: 'stockShock', value: -0.02, months: 2 });
      return 'a disparada do dólar e das commodities pressiona a inflação. O COPOM deve reagir.';
    },
  });
  def({
    id: 'enchente', title: 'Enchentes na região', tone: 'bad', cooldown: 48, minMonth: 6,
    cond: (s) => s.branches >= 1,
    weight: 0.2,
    apply: (s) => {
      spend(s, BG.CONFIG.BRANCH.cost * 0.4 * s.P, 'Reparos de agência');
      mod(s, { id: 'enchente-p', kind: 'default', product: 'pessoal', value: 1.25, months: 6, label: 'Enchentes: famílias endividadas' });
      mod(s, { id: 'enchente-e', kind: 'default', product: 'empresas', value: 1.25, months: 6, label: 'Enchentes: comércio fechado' });
      return 'chuvas fortes alagaram uma agência e prejudicaram famílias e comerciantes da região.';
    },
  });

  // ======================================================================
  // Motor de eventos
  // ======================================================================
  const byId = {};
  for (const ev of EVENTS) byId[ev.id] = ev;

  function weightOf(s, ev) {
    const diff = BG.DIFFICULTY[s.meta.difficulty];
    let w = typeof ev.weight === 'function' ? ev.weight(s) : ev.weight || 0;
    if (ev.tone === 'bad') w *= diff.eventBad;
    else if (ev.tone === 'good') w *= diff.eventGood;
    return w;
  }
  function eligible(s, ev) {
    if (ev.minMonth && s.month < ev.minMonth) return false;
    const last = s.flags.cooldowns[ev.id];
    if (ev.once && last != null) return false;
    if (last != null && s.month - last < (ev.cooldown != null ? ev.cooldown : 12)) return false;
    if (ev.cond && !ev.cond(s)) return false;
    return true;
  }
  function trigger(s, ev, news) {
    s.flags.cooldowns[ev.id] = s.month;
    const params = ev.init ? ev.init(s) : {};
    if (ev.choices) {
      s.pendingEvent = { id: ev.id, params, month: s.month };
      news.push({ type: 'event', text: `Decisão pendente: ${ev.title}.` });
    } else {
      const msg = ev.apply(s, params);
      news.push({ type: ev.tone === 'bad' ? 'bad' : ev.tone === 'good' ? 'good' : 'info', text: `${ev.title}: ${msg}` });
    }
  }

  function monthly(s) {
    const news = [];
    if (s.pendingEvent || s.over) return news;
    const cal = E().calMonth(s.month);
    if (cal === 9 && s.flags.lastDissidio !== s.month) {
      s.flags.lastDissidio = s.month;
      trigger(s, byId.dissidio, news);
      return news;
    }
    const run = byId.corrida;
    if (eligible(s, run) && chance(s, 0.4)) {
      trigger(s, run, news);
      return news;
    }
    if (chance(s, 0.33)) {
      const pool = EVENTS.filter((ev) => !ev.scheduled && !ev.forced && eligible(s, ev));
      const ev = U.pickWeighted(s, pool, (x) => weightOf(s, x));
      if (ev) trigger(s, ev, news);
    }
    return news;
  }

  function current(s) {
    const pe = s.pendingEvent;
    if (!pe) return null;
    const ev = byId[pe.id];
    if (!ev) return null;
    return {
      id: ev.id,
      title: ev.title,
      tone: ev.tone,
      text: ev.text(s, pe.params),
      choices: ev.choices.map((c, i) => {
        const available = c.available ? !!c.available(s, pe.params) : true;
        const hint = typeof c.hint === 'function' ? c.hint(s, pe.params) : c.hint || '';
        return { index: i, label: c.label, hint, available };
      }),
    };
  }

  function resolve(s, index) {
    const pe = s.pendingEvent;
    if (!pe) return { ok: false, msg: 'Nenhuma decisão pendente.' };
    const ev = byId[pe.id];
    const ch = ev && ev.choices[index];
    if (!ch) return { ok: false, msg: 'Opção inválida.' };
    if (ch.available && !ch.available(s, pe.params)) return { ok: false, msg: 'Opção indisponível.' };
    const res = ch.apply(s, pe.params);
    const msg = typeof res === 'string' ? res : res && res.msg;
    const keep = res && typeof res === 'object' && res.keep;
    if (!keep) s.pendingEvent = null;
    const type = ev.tone === 'bad' ? 'bad' : ev.tone === 'good' ? 'good' : 'info';
    E().addNews(s, type, `${ev.title}: ${msg}`);
    return { ok: true, msg, keep: !!keep };
  }

  // Dispara um evento específico (usado em testes)
  function force(s, id) {
    const news = [];
    if (byId[id]) trigger(s, byId[id], news);
    return news;
  }

  BG.Events = { list: EVENTS, byId, monthly, current, resolve, force };
})(typeof globalThis !== 'undefined' ? globalThis : window);
