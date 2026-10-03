# Banqueiro S.A.

Simulador de banco que roda no navegador. Você preside um banco brasileiro, mês a mês, a partir de janeiro de 2027: define taxas, concede crédito, administra o caixa, contrata, investe em tecnologia, enfrenta crises e responde ao Banco Central. O jogo acaba se o banco quebrar ou quando o mandato termina, com uma nota final.

Feito em HTML, CSS e JavaScript puros, sem dependências nem etapa de build. Funciona offline (só as fontes vêm do Google Fonts; sem internet, o navegador usa fontes do sistema).

## Como jogar

Abra o arquivo `index.html` no navegador. Ou sirva a pasta:

```bash
npx serve .
```

e acesse o endereço exibido. O jogo também funciona publicado no GitHub Pages, sem configuração.

Cada rodada é um mês. Ajuste a estratégia nas abas e clique em **Fechar mês** (ou aperte a barra de espaço). O botão ▶ avança os meses automaticamente em 1×, 2× ou 4×. O jogo é salvo no navegador a cada mês; pelo menu ⋯ você exporta o código do jogo para continuar em outro lugar.

## O que dá para fazer

| Área | Decisões |
|---|---|
| **Produtos e taxas** | Tarifa da conta corrente, remuneração do CDB (% do CDI), taxa e política de concessão de cinco linhas de crédito: consignado, pessoal, cartão, imobiliário e capital de giro. |
| **Tesouraria** | Caixa mínimo, aplicação automática em Tesouro Selic, compra e venda de prefixados (com marcação a mercado) e ações, captação interbancária. |
| **Operações** | Contratar e desligar atendentes, gerentes, analistas de crédito e equipe de TI; abrir e fechar agências; caixas eletrônicos; verba de marketing e campanhas. |
| **Tecnologia** | Cinco trilhas com cinco níveis cada: app, segurança cibernética, motor de crédito com IA, core bancário e compliance. Projetos levam meses para ficar prontos. |
| **Acionistas** | Política de dividendos, dividendos extraordinários, emissão de ações, aporte pessoal, recompra e abertura de capital (IPO). |

## Como a simulação funciona

- **Economia viva:** ciclo econômico com expansão, aquecimento, desaceleração, recessão e recuperação. PIB, desemprego, inflação, Ibovespa e uma Selic definida pelo COPOM oito vezes por ano em resposta à inflação.
- **Clientes:** chegam do mercado potencial (alcance das agências e do app), multiplicado pelo reconhecimento da marca e pela atratividade (tarifa, CDB, satisfação, reputação). Saem quando estão insatisfeitos. A satisfação depende do atendimento, do app, dos caixas eletrônicos, das agências, da tarifa e da equipe de TI.
- **Crédito:** a demanda reage à sua taxa em relação ao mercado, à economia e à força de vendas. Novos contratos carregam o risco da política vigente; o calote aparece meses depois e piora com o desemprego. Analistas limitam quanto você consegue conceder.
- **Captação:** conta corrente sem juros, poupança com a regra oficial (6,17% + TR ou 70% da Selic) e CDB. Pagar acima do mercado atrai dinheiro de plataformas de investimento.
- **Regulação:** depósito compulsório, contribuição ao FGC, Índice de Basileia com risco de crédito, de mercado e operacional, redesconto do Banco Central quando falta caixa, rating revisado todo ano e IR/CSLL com compensação de prejuízos.
- **Contabilidade completa:** balanço patrimonial, DRE mensal, anual e de 12 meses, indicadores (ROE, margem financeira, eficiência, inadimplência) e histórico. A variação do patrimônio fecha exatamente com lucro, dividendos e capital, e os testes conferem isso.
- **Eventos:** mais de 30 acontecimentos, a maioria com decisões: ataques hackers, fraudes, greve na data-base de setembro, fintechs concorrentes, bancos e carteiras à venda, grandes clientes corporativos, fiscalização do BC, vazamentos de dados, corridas bancárias, crises globais, pandemia, teto de juros e mais.
- **Mercado:** cinco bancos concorrentes crescem com a economia. Suba no ranking por ativos.
- **Pontuação:** seu patrimônio pessoal (dividendos recebidos) mais o valor da sua participação no banco, em reais de 2027. Emitir ações traz capital, mas dilui sua fatia.

O banco quebra se o patrimônio ficar negativo, se a Basileia ficar abaixo de 5,5% por três meses ou se depender do redesconto por seis meses seguidos.

### Cenários e dificuldades

- **Banco Regional:** uma agência, carteira equilibrada, espaço para crescer.
- **Fintech Digital:** sem agências, app moderno, conta grátis e saldos pequenos.
- **Banco em Apuros:** equipe inchada, sistemas velhos, tarifas caras e uma carteira de crédito podre, com capital no limite.

Dificuldades Fácil, Normal e Difícil mudam o capital inicial, a frequência de crises e de eventos ruins. O mandato pode durar 10 anos, 20 anos ou não ter fim. Há 23 conquistas e uma tabela de recordes salva no navegador.

## Desenvolvimento

O motor de simulação não depende do navegador e roda no Node:

```bash
npm test          # testes do motor (node --test)
npm run build     # gera dist/banqueiro-sa.html, o jogo inteiro em um único arquivo
```

Os testes verificam a contabilidade mês a mês, o determinismo por semente, salvar e carregar, as ações do jogador, todas as opções de todos os eventos, as regras de quebra e de restrição do Banco Central e o equilíbrio do jogo (uma gestão competente sobrevive; uma imprudente quebra).

### Estrutura

```
index.html          página do jogo
css/style.css       visual (temas claro e escuro, layout responsivo)
js/util.js          gerador aleatório com semente e formatação em pt-BR
js/config.js        parâmetros: produtos, equipe, tecnologia, cenários, concorrentes
js/economy.js       ciclo econômico, inflação, Selic e bolsa
js/engine.js        estado do banco, fechamento do mês, métricas, ações e conquistas
js/events.js        eventos com decisões e notícias
js/charts.js        gráficos em canvas
js/ui.js            telas, modais e notificações
js/main.js          laço do jogo, avanço automático e salvamento
tests/              testes do motor
scripts/build.js    gera a versão em arquivo único
```

Os valores e regras são simplificações inspiradas no sistema financeiro brasileiro, ajustadas para o jogo. Os bancos concorrentes e as empresas dos eventos são fictícios.

## Licença

MIT
