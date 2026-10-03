/* Controlador do jogo: laço de meses, avanço automático, salvamento e preferências. */
(function (G) {
  'use strict';
  const BG = (G.BankGame = G.BankGame || {});
  const U = BG.U;

  const SAVE_KEY = 'banqueiro-sa:save:v1';
  const PREFS_KEY = 'banqueiro-sa:prefs:v1';
  const RECORDS_KEY = 'banqueiro-sa:records:v1';
  const SPEEDS = { 1: 1600, 2: 800, 4: 350 };

  // localStorage pode não existir ou lançar erro (janela anônima, prévia): tudo protegido.
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  };
  const readJSON = (k, fallback) => {
    const raw = store.get(k);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  };
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function isValidState(s) {
    return s && s.v === 1 && s.meta && s.products && s.deposits && s.staff && s.tech && Array.isArray(s.history) && s.rng;
  }

  const Game = {
    state: null,
    auto: false,
    speed: 1,
    timer: null,
    prefs: {},

    act(name, ...args) {
      const fn = BG.Engine.actions[name];
      if (!fn || !this.state) return null;
      const r = fn(this.state, ...args);
      if (r && r.msg) BG.UI.toast(r.msg, r.ok ? 'good' : 'bad');
      if (r && r.ok) this.save();
      BG.UI.render();
      return r;
    },

    closeMonth() {
      const s = this.state;
      if (!s) return;
      if (BG.UI.modal) return;
      if (s.over) { this.pauseAuto(); BG.UI.gameOverModal(); return; }
      if (s.pendingEvent) { this.pauseAuto(); BG.UI.eventModal(); return; }
      const label = U.monthLabelLong(s.month, s.meta.startYear);
      const res = BG.Engine.simulateMonth(s);
      if (!res) return;
      this.save();
      BG.UI.render();
      const ni = res.report.lucroLiquido;
      if (!this.auto) BG.UI.toast(`${cap(label)} fechado: ${ni >= 0 ? 'lucro' : 'prejuízo'} de ${U.fmtMoney(Math.abs(ni))}.`, ni >= 0 ? 'good' : 'bad', 3500);
      for (const n of res.news.filter((x) => x.type === 'bad' || x.type === 'good').slice(0, 2)) BG.UI.toast(n.text, n.type, 6500);
      for (const a of res.achievements) BG.UI.toast(`Conquista desbloqueada: ${a.name}`, 'achievement', 6500);
      this.showPendingModals();
    },

    // Fim de jogo > fim do mandato > relatório anual > decisão pendente
    showPendingModals() {
      const s = this.state;
      if (!s || BG.UI.modal) return;
      if (s.over) { this.pauseAuto(); BG.UI.gameOverModal(); return; }
      if (s.finished && !s.meta.finishedShown) {
        s.meta.finishedShown = true;
        this.save();
        this.pauseAuto();
        BG.UI.finishedModal();
        return;
      }
      if (s.flags.annualReport) {
        const rep = s.flags.annualReport;
        s.flags.annualReport = null;
        this.save();
        if (!this.auto) {
          BG.UI.annualModal(rep);
          BG.UI.modal.onClose = () => this.showPendingModals();
          return;
        }
        BG.UI.toast(`Ano de ${rep.year} encerrado com lucro de ${U.fmtMoney(rep.ytd.lucroLiquido || 0)}.`, 'info', 5000);
      }
      if (s.pendingEvent) { this.pauseAuto(); BG.UI.eventModal(); }
    },

    resolveEvent(i) {
      const r = BG.Events.resolve(this.state, i);
      if (!r.ok) { BG.UI.toast(r.msg, 'bad'); return; }
      BG.UI.closeModal();
      this.save();
      BG.UI.render();
      if (r.keep) BG.UI.eventModal();
      else BG.UI.toast(r.msg, 'info', 7000);
    },

    toggleAuto() { if (this.auto) this.pauseAuto(); else this.startAuto(); },
    startAuto() {
      const s = this.state;
      if (!s || s.over || BG.UI.modal) return;
      if (s.pendingEvent) { BG.UI.eventModal(); return; }
      this.auto = true;
      BG.UI.render();
      this.tick();
    },
    tick() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (!this.auto) return;
        this.closeMonth();
        if (this.auto) this.tick();
      }, SPEEDS[this.speed] || SPEEDS[1]);
    },
    pauseAuto() {
      const was = this.auto;
      this.auto = false;
      clearTimeout(this.timer);
      if (was) BG.UI.render();
    },
    setSpeed(x) {
      this.speed = SPEEDS[x] ? x : 1;
      this.savePrefs({ speed: this.speed });
      if (this.auto) this.tick();
    },

    newGame(opts) {
      this.pauseAuto();
      this.state = BG.Engine.newGame(opts);
      BG.UI.tab = 'painel';
      this.save();
      BG.UI.render();
      BG.UI.toast(`${this.state.meta.bankName} está aberto. Feche o primeiro mês quando estiver pronto.`, 'good');
    },

    save(manual) {
      if (!this.state) return;
      const ok = store.set(SAVE_KEY, JSON.stringify(this.state));
      if (manual) BG.UI.toast(ok ? 'Jogo salvo neste navegador.' : 'Não foi possível salvar neste navegador. Use Exportar para guardar o código do jogo.', ok ? 'good' : 'bad');
    },
    load() {
      const s = readJSON(SAVE_KEY, null);
      return isValidState(s) ? s : null;
    },
    exportCode() {
      try { return btoa(unescape(encodeURIComponent(JSON.stringify(this.state)))); } catch (e) { return JSON.stringify(this.state); }
    },
    importCode(text) {
      let obj = null;
      const t = String(text || '').trim();
      try { obj = JSON.parse(t); } catch (e) {
        try { obj = JSON.parse(decodeURIComponent(escape(atob(t)))); } catch (e2) { obj = null; }
      }
      if (!isValidState(obj)) return { ok: false, msg: 'Código inválido. Confira se copiou o texto inteiro.' };
      this.pauseAuto();
      this.state = obj;
      this.save();
      BG.UI.render();
      this.showPendingModals();
      return { ok: true };
    },

    records() { return readJSON(RECORDS_KEY, []); },
    recordScore(mult, grade) {
      const s = this.state;
      if (!s || s.meta.recorded) return;
      s.meta.recorded = true;
      const list = this.records();
      list.push({
        bank: s.meta.bankName,
        scenario: BG.SCENARIOS[s.meta.scenario].name,
        difficulty: BG.DIFFICULTY[s.meta.difficulty].name,
        months: s.month,
        mult: Math.round(mult * 100) / 100,
        grade,
      });
      list.sort((a, b) => b.mult - a.mult);
      store.set(RECORDS_KEY, JSON.stringify(list.slice(0, 10)));
      this.save();
    },

    savePrefs(patch) {
      this.prefs = Object.assign({}, this.prefs, patch);
      store.set(PREFS_KEY, JSON.stringify(this.prefs));
    },
    setTheme(t) {
      const root = document.documentElement;
      if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
      else root.removeAttribute('data-theme');
      this.savePrefs({ theme: t });
      if (BG.Charts) BG.Charts.redrawAll();
    },
  };

  BG.Game = Game;

  function start(hotData) {
    BG.UI.init();
    Game.prefs = readJSON(PREFS_KEY, {}) || {};
    if (Game.prefs.theme && Game.prefs.theme !== 'system') Game.setTheme(Game.prefs.theme);
    Game.speed = SPEEDS[Game.prefs.speed] ? Game.prefs.speed : 1;
    if (Game.prefs.tab && BG.UI.TABS.some((t) => t.id === Game.prefs.tab)) BG.UI.tab = Game.prefs.tab;

    let first = false;
    let s = hotData && isValidState(hotData.state) ? hotData.state : Game.load();
    if (!s) {
      s = BG.Engine.newGame({ bankName: 'Banco Aurora' });
      first = true;
    }
    Game.state = s;
    BG.UI.render();
    if (first) BG.UI.newGameModal(true);
    else Game.showPendingModals();

    const hot = window.claude && window.claude.hot;
    if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ state: Game.state }));
  }

  function boot() {
    const hot = window.claude && window.claude.hot;
    if (hot && typeof hot.ready === 'function') hot.ready(start);
    else start((hot && hot.data) || {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : window);
