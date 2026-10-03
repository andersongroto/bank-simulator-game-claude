/* Parâmetros do jogo: produtos, equipe, tecnologia, cenários, concorrentes e conquistas.
   Valores monetários estão em reais de janeiro/2027 e são corrigidos pelo índice de preços (s.P). */
(function (G) {
  'use strict';
  const BG = (G.BankGame = G.BankGame || {});

  BG.CONFIG = {
    START_YEAR: 2027,
    BASEL_MIN: 10.5, // Índice de Basileia mínimo (%)
    BASEL_INTERVENTION: 5.5, // abaixo disso por 3 meses seguidos: intervenção do BC
    TAX_RATE: 0.4, // IR + CSLL simplificados
    FGC_RATE: 0.000125, // contribuição mensal ao FGC sobre depósitos
    COMPULSORY: { checking: 0.21, savings: 0.2, cdb: 0.0 },
    ADMIN_FIXED: 150000,
    ADMIN_ASSETS: 0.003, // despesas administrativas anuais proporcionais aos ativos
    COST_PER_CUSTOMER: 24,
    SERVICE_FEE_PER_CUSTOMER: 3.5, // tarifas de serviços (TED, boletos, seguros...)
    MARKET_FEE: 22, // tarifa mensal média de mercado (R$ de 2027)
    INTERCHANGE: 0.012,
    BRANCH: { cost: 3000000, monthly: 120000, reach: 30000, book: 2000000, sellBack: 0.3, custIdeal: 15000 },
    ATM: { cost: 120000, monthly: 2500, book: 80000, custPer: 2000 },
    HQ_REACH: 15000,
    DIGITAL_REACH: [0, 40000, 120000, 350000, 900000, 2000000],
    DEPRECIATION: 0.014,
    ACQ_BASE: 0.008,
    MIN_OPERATING_CASH: 0.02,
    ANALYST_CAPACITY: 2000000,
    INTERBANK_SPREAD: 1.5, // p.p. acima do CDI
    REDISCOUNT_SPREAD: 4, // p.p. acima da Selic
    LTN_DURATION: 2.6,
    STOCK_RW: 2.5,
    COPOM_MONTHS: [1, 3, 5, 6, 7, 9, 11, 12],
    INITIAL_SHARES: 10000000,
    HISTORY_MAX: 720,
    NEWS_MAX: 300,
  };

  // Produtos de crédito. spread = p.p. acima da Selic que o mercado cobra.
  // default = inadimplência anual base (%), maturity = prazo médio em meses,
  // demand = demanda mensal por cliente (R$), rw = peso de risco (Basileia).
  BG.PRODUCTS = {
    consignado: {
      name: 'Crédito Consignado', short: 'Consignado',
      desc: 'Parcelas descontadas direto da folha de pagamento ou do benefício do INSS. Risco baixo e clientes muito sensíveis à taxa.',
      spread: 4.5, default: 2.0, recovery: 0.45, maturity: 60, demand: 65, rw: 0.75, elasticity: 4.0,
      gdpSens: 0.03, selicSens: 0.02, unempSens: 0.4,
    },
    pessoal: {
      name: 'Crédito Pessoal', short: 'Pessoal',
      desc: 'Empréstimo sem garantia. Taxas altas, mas a inadimplência sobe rápido quando o desemprego aumenta.',
      spread: 20, default: 11, recovery: 0.12, maturity: 24, demand: 140, rw: 1.0, elasticity: 2.0,
      gdpSens: 0.06, selicSens: 0.03, unempSens: 1.0,
    },
    cartao: {
      name: 'Cartão de Crédito', short: 'Cartão',
      desc: 'Saldo financiado de cartões. Gera também receita de intercâmbio sobre os gastos. O rotativo tem o maior risco da carteira.',
      spread: 24, default: 15, recovery: 0.05, maturity: 6, demand: 420, rw: 1.0, elasticity: 1.2,
      gdpSens: 0.05, selicSens: 0.01, unempSens: 1.0,
    },
    imobiliario: {
      name: 'Financiamento Imobiliário', short: 'Imobiliário',
      desc: 'Prazos longos com o imóvel como garantia. Inadimplência mínima e alta recuperação, mas margem estreita e muito sensível à Selic.',
      spread: 2, default: 1.2, recovery: 0.7, maturity: 240, demand: 14, rw: 0.5, elasticity: 5.0,
      gdpSens: 0.05, selicSens: 0.07, unempSens: 0.6,
    },
    empresas: {
      name: 'Capital de Giro (PJ)', short: 'Empresas',
      desc: 'Crédito para pequenas e médias empresas. Bom retorno, mas o risco acompanha de perto o ciclo econômico.',
      spread: 5.5, default: 4.5, recovery: 0.3, maturity: 18, demand: 185, rw: 1.0, elasticity: 3.0,
      gdpSens: 0.1, selicSens: 0.04, unempSens: 1.6,
    },
  };
  BG.PRODUCT_KEYS = Object.keys(BG.PRODUCTS);

  BG.POLICIES = {
    suspensa: { name: 'Suspensa', approval: 0, risk: 1, desc: 'Não concede novos empréstimos.' },
    conservadora: { name: 'Conservadora', approval: 0.55, risk: 0.65, desc: 'Aprova só bons pagadores. Menos volume, menos calote.' },
    moderada: { name: 'Moderada', approval: 0.75, risk: 1.0, desc: 'Equilíbrio entre volume e risco.' },
    agressiva: { name: 'Agressiva', approval: 0.93, risk: 1.55, desc: 'Aprova quase todos. Muito volume e muito mais calote.' },
  };
  BG.POLICY_KEYS = ['suspensa', 'conservadora', 'moderada', 'agressiva'];

  // Equipe. ratio: clientes por funcionário (base), ajustado pelo nível do app.
  BG.ROLES = {
    atendimento: { name: 'Atendimento', plural: 'Atendentes e caixas', salary: 4500, desc: 'Atendem clientes nas agências e na central. Falta de atendentes derruba a satisfação.' },
    gerentes: { name: 'Gerentes', plural: 'Gerentes de relacionamento', salary: 14000, desc: 'Vendem crédito e cuidam da carteira. Aumentam a demanda por empréstimos.' },
    analistas: { name: 'Analistas de crédito', plural: 'Analistas de crédito e risco', salary: 11000, desc: 'Cada analista avalia cerca de R$ 2 milhões em novos empréstimos por mês.' },
    ti: { name: 'Tecnologia', plural: 'Engenheiros e equipe de TI', salary: 16000, desc: 'Mantêm sistemas e app no ar. Equipe pequena demais provoca falhas.' },
  };
  BG.ROLE_KEYS = Object.keys(BG.ROLES);

  BG.TECH = {
    app: {
      name: 'App e Internet Banking',
      desc: 'Amplia o alcance digital, melhora a satisfação e reduz a necessidade de atendentes e gerentes.',
      costs: [1500000, 4000000, 10000000, 25000000, 60000000], maint: 40000,
      levels: ['Sem app', 'Site básico', 'App com PIX', 'App completo', 'Super app', 'Banco digital de referência'],
    },
    seguranca: {
      name: 'Segurança Cibernética',
      desc: 'Reduz a chance e o custo de ataques hackers, vazamentos de dados e golpes.',
      costs: [1000000, 2500000, 6000000, 14000000, 30000000], maint: 25000,
      levels: ['Nenhuma', 'Antivírus e firewall', 'Centro de operações (SOC)', 'Antifraude com IA', 'Zero trust', 'Referência no setor'],
    },
    credito: {
      name: 'Motor de Crédito (IA)',
      desc: 'Modelos de score que reduzem a inadimplência dos novos empréstimos e aumentam a aprovação.',
      costs: [2000000, 5000000, 12000000, 25000000, 50000000], maint: 30000,
      levels: ['Análise manual', 'Score de bureau', 'Modelo estatístico', 'Machine learning', 'Open Finance integrado', 'IA em tempo real'],
    },
    core: {
      name: 'Core Bancário e Nuvem',
      desc: 'Moderniza os sistemas: reduz o custo por cliente, a equipe de TI necessária e as falhas.',
      costs: [2000000, 6000000, 15000000, 35000000, 80000000], maint: 50000,
      levels: ['Mainframe antigo', 'Sistema legado estável', 'Arquitetura de serviços', 'Nuvem híbrida', 'Nuvem nativa', 'Plataforma em tempo real'],
    },
    compliance: {
      name: 'Compliance e Governança',
      desc: 'Reduz fraudes internas e multas do Banco Central e melhora a reputação e o valor de mercado.',
      costs: [800000, 2000000, 5000000, 10000000, 20000000], maint: 20000,
      levels: ['Inexistente', 'Políticas básicas', 'Auditoria interna', 'Comitês independentes', 'Governança de mercado', 'Padrão internacional'],
    },
  };
  BG.TECH_KEYS = Object.keys(BG.TECH);

  BG.CAMPAIGNS = {
    digital: { name: 'Campanha nas redes sociais', cost: 400000, awareness: 0.04, rep: 0, cooldown: 1, desc: 'Anúncios segmentados por um mês.' },
    indicacao: { name: 'Indique e ganhe', cost: 1000000, awareness: 0.01, rep: 0, cooldown: 4, modifier: { kind: 'acquisition', value: 1.4, months: 3 }, desc: 'Bônus para quem traz amigos: +40% de novos clientes por 3 meses.' },
    tv: { name: 'Comercial em TV aberta', cost: 3000000, awareness: 0.12, rep: 1, cooldown: 3, desc: 'Horário nobre em rede nacional.' },
    patrocinio: { name: 'Patrocínio de clube de futebol', cost: 8000000, awareness: 0.18, rep: 3, cooldown: 12, desc: 'Sua marca na camisa por uma temporada.' },
  };

  BG.SCENARIOS = {
    regional: {
      name: 'Banco Regional',
      desc: 'Um banco tradicional com uma agência sede, carteira de crédito equilibrada e espaço para crescer.',
      customers: 15000, branches: 1, atms: 6,
      staff: { atendimento: 34, gerentes: 11, analistas: 6, ti: 7 },
      tech: { app: 1, seguranca: 1, credito: 0, core: 1, compliance: 0 },
      fee: 19.9, cdbPct: 100, reputation: 55, satisfaction: 65, awareness: 0.3,
      profile: { checking: 2500, savings: 5000, cdb: 8000 },
      loansMult: 1.0, equityMult: 1.0, marketing: 100000,
    },
    fintech: {
      name: 'Fintech Digital',
      desc: 'Nenhuma agência, app moderno e conta grátis. Muitos clientes com saldos pequenos e custo alto de tecnologia.',
      customers: 30000, branches: 0, atms: 0,
      staff: { atendimento: 26, gerentes: 9, analistas: 5, ti: 10 },
      tech: { app: 2, seguranca: 1, credito: 1, core: 2, compliance: 0 },
      fee: 0, cdbPct: 105, reputation: 45, satisfaction: 72, awareness: 0.25,
      profile: { checking: 1200, savings: 1500, cdb: 3500 },
      loansMult: 0.5, equityMult: 1.0, marketing: 200000,
    },
    resgate: {
      name: 'Banco em Apuros',
      desc: 'Você assumiu um banco antigo e mal administrado: equipe inchada, sistemas velhos, tarifas caras e uma carteira de crédito podre. Capital no limite.',
      customers: 20000, branches: 3, atms: 8,
      staff: { atendimento: 80, gerentes: 30, analistas: 7, ti: 5 },
      tech: { app: 0, seguranca: 0, credito: 0, core: 0, compliance: 0 },
      fee: 34.9, cdbPct: 102, reputation: 30, satisfaction: 45, awareness: 0.4,
      profile: { checking: 2500, savings: 5000, cdb: 8000 },
      loansMult: 0.95, equityMult: 0.75, marketing: 50000,
      badPortfolio: true,
      // Capital calibrado para começar perto do mínimo regulatório em qualquer dificuldade
      equityFixed: 45000000,
    },
  };

  BG.DIFFICULTY = {
    facil: { name: 'Fácil', equity: 80000000, rescue: 1.3, eventBad: 0.6, eventGood: 1.3, recession: 0.7, desc: 'Mais capital, menos crises.' },
    normal: { name: 'Normal', equity: 50000000, rescue: 1.0, eventBad: 1, eventGood: 1, recession: 1, desc: 'O desafio pensado para o jogo.' },
    dificil: { name: 'Difícil', equity: 30000000, rescue: 0.85, eventBad: 1.4, eventGood: 0.8, recession: 1.35, desc: 'Pouco capital, crises frequentes.' },
  };

  BG.DURATIONS = [
    { months: 120, name: '10 anos' },
    { months: 240, name: '20 anos' },
    { months: 0, name: 'Sem fim' },
  ];

  // Fases do ciclo econômico
  BG.PHASES = {
    expansao: { name: 'Expansão', gdp: 2.5, infl: 4.0, avg: 26, min: 8, next: { boom: 0.4, desaceleracao: 0.6 } },
    boom: { name: 'Aquecimento', gdp: 4.6, infl: 6.0, avg: 12, min: 6, next: { desaceleracao: 1 } },
    desaceleracao: { name: 'Desaceleração', gdp: 0.7, infl: 4.6, avg: 9, min: 4, next: { recessao: 0.55, expansao: 0.45 } },
    recessao: { name: 'Recessão', gdp: -2.6, infl: 2.6, avg: 11, min: 5, next: { recuperacao: 1 } },
    recuperacao: { name: 'Recuperação', gdp: 1.8, infl: 3.4, avg: 12, min: 5, next: { expansao: 1 } },
  };

  BG.COMPETITORS = [
    { id: 'horizonte', name: 'Banco Horizonte', style: 'Tradicional', assets: 9e9, customers: 420000, growth: 0.0, vol: 0.004, cyc: 1.0 },
    { id: 'ipe', name: 'Banco Ipê', style: 'Regional', assets: 3.2e9, customers: 150000, growth: 0.01, vol: 0.006, cyc: 1.0 },
    { id: 'cerrado', name: 'Banco Cerrado', style: 'Agronegócio', assets: 1.6e9, customers: 45000, growth: 0.02, vol: 0.012, cyc: 1.6 },
    { id: 'lumen', name: 'Lumen Bank', style: 'Digital', assets: 0.6e9, customers: 160000, growth: 0.12, vol: 0.02, cyc: 1.2 },
    { id: 'araucaria', name: 'Cooperativa Araucária', style: 'Cooperativa', assets: 0.35e9, customers: 18000, growth: 0.03, vol: 0.004, cyc: 0.8 },
  ];

  BG.RATINGS = ['CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA'];

  BG.GRADES = [
    { min: 50, name: 'Lenda das finanças' },
    { min: 20, name: 'Magnata' },
    { min: 8, name: 'Banqueiro de sucesso' },
    { min: 3, name: 'Gestor competente' },
    { min: 1, name: 'Sobrevivente' },
    { min: 0, name: 'Gestão desastrosa' },
  ];
})(typeof globalThis !== 'undefined' ? globalThis : window);
