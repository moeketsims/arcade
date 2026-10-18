// Menu system: a list of items navigable with D-pad / stick / A / B (controller) or arrows / Enter / Backspace / mouse.
// Used for the title screen, main menu, pause menu, settings and the results screen.
import { esc, clamp } from './util.js';
import { levelForXp, DIFFICULTY, MODES } from './data.js';

const KB = { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', A: 'Enter', B: 'Backspace', START: 'Esc' };
/** Button hint: controller glyph while a pad is in use, keyboard key otherwise (menus use arrows / Enter, not the in-game bindings). */
export const nav = (ctl, b) => (ctl.usingPad && ctl.pad.connected ? ctl.pad.glyph(b) : `<kbd>${KB[b] || b}</kbd>`);

export class Menu {
  constructor(root, ctl, sound) {
    this.root = root; this.ctl = ctl; this.sound = sound; this.screen = null; this.sel = 0; this.items = []; this.els = []; this.visible = false;
    this.root.innerHTML = `<div class="fl-panel"><div class="fl-head"></div><div class="fl-list"></div><div class="fl-desc"></div><div class="fl-foot"></div></div>`;
    this.panel = this.root.querySelector('.fl-panel'); this.head = this.root.querySelector('.fl-head'); this.list = this.root.querySelector('.fl-list');
    this.desc = this.root.querySelector('.fl-desc'); this.foot = this.root.querySelector('.fl-foot');
  }
  /**
   * screen: { cls, title, sub, items: [{label, action?, value?(), cycle?(dir), slider?, disabled?, desc?, hidden?}], footer(), onBack?, extra? }
   */
  show(screen, keepSel = false) {
    this.ctl.consume?.();
    this.screen = screen; this.visible = true; this.root.classList.remove('hidden'); this.root.className = `fl-screen ${screen.cls || ''}`;
    this.items = screen.items.filter(i => !i.hidden);
    if (!keepSel || this.sel >= this.items.length || this.items[this.sel]?.disabled || this.items[this.sel]?.spacer) this.sel = Math.max(0, this.items.findIndex(i => !i.disabled && !i.spacer));
    this.render();
  }
  hide() { this.visible = false; this.root.classList.add('hidden'); }
  render() {
    const s = this.screen; if (!s) return;
    this.head.innerHTML = `${s.logo ? `<div class="fl-logo">${s.logo}</div>` : ''}${s.title ? `<h1>${esc(s.title)}</h1>` : ''}${s.sub ? `<p class="sub">${s.sub}</p>` : ''}${s.extra ? `<div class="fl-extra">${s.extra()}</div>` : ''}`;
    this.list.innerHTML = '';
    this.els = this.items.map((it, i) => {
      const el = document.createElement('div');
      el.className = 'fl-item' + (it.disabled ? ' off' : '') + (it.spacer ? ' spacer' : '') + (i === this.sel ? ' sel' : '');
      el.innerHTML = it.spacer ? '' : `<span class="lbl">${esc(it.label)}</span>${it.value ? `<span class="val"></span>` : ''}`;
      if (!it.spacer) {
        el.onmouseenter = () => { if (!it.disabled && this.sel !== i) { this.sel = i; this.refresh(); } };
        el.onclick = () => { if (it.disabled) return; this.sel = i; this.refresh(); this.activate(it, 1, true); };
      }
      this.list.appendChild(el); return el;
    });
    this.refresh();
    this.foot.innerHTML = s.footer ? s.footer() : '';
  }
  refresh() {
    this.items.forEach((it, i) => {
      const el = this.els[i]; if (!el) return;
      el.classList.toggle('sel', i === this.sel);
      if (it.value) { const v = el.querySelector('.val'); if (v) v.innerHTML = it.slider ? this.sliderHTML(it) : `<i>◀</i> ${esc(String(it.value()))} <i>▶</i>`; }
    });
    const cur = this.items[this.sel]; this.desc.innerHTML = cur?.desc ? (typeof cur.desc === 'function' ? cur.desc() : cur.desc) : '';
    if (this.screen?.footer) this.foot.innerHTML = this.screen.footer();
  }
  sliderHTML(it) { const f = clamp((it.slider.get() - it.slider.min) / (it.slider.max - it.slider.min), 0, 1); return `<span class="bar"><b style="width:${(f * 100).toFixed(0)}%"></b></span> ${esc(String(it.value()))}`; }
  activate(it, dir, click = false) {
    if (it.disabled || it.spacer) return;
    if (it.cycle) { it.cycle(dir); this.sound.ui('ui'); this.refresh(); return; }
    if (it.action) { this.sound.ui('select'); it.action(click); }
  }
  /** Returns true if the menu consumed input this frame. */
  update(dt) {
    if (!this.visible || !this.screen) return false;
    const c = this.ctl, n = this.items.length;
    if (c.navY && n) {
      let i = this.sel, tries = 0;
      do { i = (i + c.navY + n) % n; tries++; } while ((this.items[i].disabled || this.items[i].spacer) && tries <= n);
      if (i !== this.sel) { this.sel = i; this.sound.ui('ui'); this.refresh(); this.els[i]?.scrollIntoView?.({ block: 'nearest' }); }
    }
    const cur = this.items[this.sel];
    if (c.navX && cur?.cycle) { cur.cycle(c.navX); this.sound.ui('ui'); this.refresh(); }
    if (c.confirm && cur) this.activate(cur, 1);
    if (c.back && this.screen.onBack) { this.sound.ui('back'); this.screen.onBack(); }
    return true;
  }
}

/** Helpers that build the standard screens. app = { settings, profile, loadoutSummary(), actions } */
export function titleScreen(app) {
  return {
    cls: 'title', logo: 'FRONTLINE <b>OPS</b>', title: '', items: [],
    sub: `<p class="blink">Press <span class="glyph face a">A</span> / <kbd>Enter</kbd> or click to start</p><p class="tag">Robot squads. Fast movement. Every weapon, every knife.</p>`,
    footer: () => `<span>${app.ctl.pad.glyph('TOUCH')} Controls</span><span>${app.ctl.pad.glyph('HOME')} Back to the Arcade</span>`,
  };
}

export function mainScreen(app) {
  const S = app.settings, a = app.actions;
  const diffs = ['recruit', 'regular', 'veteran'];
  return {
    cls: 'main', logo: 'FRONTLINE <b>OPS</b>', title: '',
    extra: () => { const L = levelForXp(app.profile.xp || 0); return `<div class="rank"><span>RANK ${L.level}</span><div class="xpbar"><b style="width:${(L.into / L.need * 100).toFixed(0)}%"></b></div><small>${Math.round(L.into)} / ${L.need} XP</small></div>`; },
    items: [
      { label: 'Team Deathmatch', desc: MODES.tdm.desc, action: () => a.start('tdm') },
      { label: 'Free-for-All', desc: MODES.ffa.desc, action: () => a.start('ffa') },
      { label: 'Firing Range', desc: MODES.range.desc, action: () => a.start('range') },
      { spacer: true },
      { label: 'Loadout', desc: () => app.loadoutSummary(), action: () => a.loadout() },
      { label: 'Difficulty', desc: 'How sharp the enemy robots are: reaction time, accuracy and aggression. Allies always fight at Regular.', value: () => DIFFICULTY[S.difficulty].name, cycle: d => { const i = diffs.indexOf(S.difficulty); S.difficulty = diffs[(i + d + 3) % 3]; a.saveSettings(); } },
      { label: 'Settings', desc: 'Sensitivity, field of view, aim assist, volume.', action: () => a.settings() },
      { label: 'Controls', desc: 'Every button of the controller and keyboard.', action: () => a.controls() },
      { label: 'Back to Arcade', action: () => a.home() },
    ],
    footer: () => `<span>${nav(app.ctl, 'UP')}${nav(app.ctl, 'DOWN')} choose</span><span>${nav(app.ctl, 'A')} select</span><span>${nav(app.ctl, 'LEFT')}${nav(app.ctl, 'RIGHT')} change</span>`,
  };
}

export function pauseScreen(app) {
  const a = app.actions;
  return {
    cls: 'pause', title: 'Paused', sub: `<span class="m">${esc(app.matchName())}</span>`,
    onBack: () => a.resume(),
    items: [
      { label: 'Resume', action: () => a.resume() },
      { label: 'Loadout', desc: 'Changes apply the next time you respawn.', action: () => a.loadout(true) },
      { label: 'Controls', action: () => a.controls() },
      { label: 'Settings', action: () => a.settings(true) },
      { label: 'Restart', action: () => a.restart() },
      { label: 'Back to Arcade', action: () => a.home() },
    ],
    footer: () => `<span>${nav(app.ctl, 'START')} resume</span><span>${nav(app.ctl, 'A')} select</span>`,
  };
}

export function settingsScreen(app, back) {
  const S = app.settings, a = app.actions;
  const slider = (label, key, min, max, step, fmt, desc) => ({ label, desc, slider: { get: () => S[key], min, max }, value: () => fmt(S[key]), cycle: d => { S[key] = clamp(+(S[key] + d * step).toFixed(2), min, max); a.saveSettings(); } });
  const toggle = (label, key, desc) => ({ label, desc, value: () => (S[key] ? 'On' : 'Off'), cycle: () => { S[key] = !S[key]; a.saveSettings(); } });
  return {
    cls: 'settings', title: 'Settings', onBack: back,
    items: [
      slider('Stick sensitivity', 'sensStick', 0.4, 2.2, 0.1, v => v.toFixed(1), 'Right-stick look speed. Aiming down sights slows it automatically.'),
      slider('Mouse sensitivity', 'sensMouse', 0.3, 2.5, 0.1, v => v.toFixed(1), 'Mouse look speed (click the game to capture the mouse).'),
      toggle('Invert look Y', 'invertY', 'Push up to look down.'),
      toggle('Aim assist', 'aimAssist', 'Slows your aim slightly when the crosshair is near a robot (controller).'),
      slider('Field of view', 'fov', 70, 110, 5, v => `${v}°`, 'Horizontal field of view.'),
      toggle('Rumble', 'rumble', 'Controller vibration.'),
      slider('Volume', 'volume', 0, 1, 0.1, v => `${Math.round(v * 100)}%`, 'Master volume.'),
      toggle('Shadows', 'shadows', 'Turn off if the game runs slowly. Applies to the next match.'),
      { spacer: true },
      { label: 'Back', action: back },
    ],
    footer: () => `<span>${nav(app.ctl, 'LEFT')}${nav(app.ctl, 'RIGHT')} adjust</span><span>${nav(app.ctl, 'B')} back</span>`,
  };
}

export function resultsScreen(app, res) {
  const a = app.actions;
  const head = { victory: 'VICTORY', defeat: 'DEFEAT', draw: 'DRAW', podium: 'TOP THREE' }[res.outcome] || 'MATCH OVER';
  const sub = res.teams ? `${res.scoreA} - ${res.scoreB}` : `You finished #${res.rank} of ${res.total}`;
  const rows = res.rows.slice(0, 12).map(r => `<tr class="${r.you ? 'you' : ''} ${r.team === 0 ? 'ally' : 'foe'}"><td>${esc(r.name)}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.assists}</td><td>${r.score}</td></tr>`).join('');
  return {
    cls: `results ${res.outcome}`, title: head, sub: `<span class="m">${esc(res.mode)} &middot; ${sub}</span>`, onBack: () => a.menu(),
    extra: () => `<table class="rt"><tr><th></th><th>K</th><th>D</th><th>A</th><th>Score</th></tr>${rows}</table><p class="xp">+${res.xp} XP</p>`,
    items: [{ label: 'Play again', action: () => a.again() }, { label: 'Main menu', action: () => a.menu() }],
    footer: () => `<span>${nav(app.ctl, 'A')} select</span>`,
  };
}
