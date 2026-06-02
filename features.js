/* =====================================================================
   FEATURE PACK (additive, loads after game.js)
   1. Power-up drops: BOMB (3x3) + RAINBOW (matches any color)
   2. Daily Challenge (seeded RNG) + per-day leaderboard
   3. Particle FX + screen-shake punch on gravity flip
   4. Chain juice: score popups, multiplier text, shake-on-chain
   5. Mobile touch controls + Settings panel (sfx, particles, colorblind)
   ===================================================================== */

(function () {
  // ---------- SETTINGS ----------
  const SK = 'puyo.settings.v2';
  const defaults = { particles: true, sfx: 0.5, colorblind: false };
  let settings = { ...defaults, ...(safeJSON(localStorage.getItem(SK)) || {}) };
  function saveSettings() { localStorage.setItem(SK, JSON.stringify(settings)); }
  function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }

  const NORMAL_COLORS = ['#FF0055', '#00FF88', '#0099FF', '#FFCC00'];
  const CB_COLORS     = ['#E69F00', '#56B4E9', '#009E73', '#F0E442'];
  function applyColorblind() {
    const t = settings.colorblind ? CB_COLORS : NORMAL_COLORS;
    COLORS.length = 0; COLORS.push(...t);
  }
  applyColorblind();

  // ---------- AUDIO (synthesized blips, no assets) ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
    return audioCtx;
  }
  function beep(freq, dur = 0.08, type = 'square', vol = 1) {
    if (!settings.sfx) return;
    const ac = ensureAudio(); if (!ac) return;
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = settings.sfx * 0.25 * vol;
    o.connect(g).connect(ac.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.stop(ac.currentTime + dur);
  }
  document.addEventListener('click', () => ensureAudio() && audioCtx.resume(), { once: true });

  // ---------- POWER-UPS ----------
  // Roughly 1 in 8 spawned pairs gets ONE special puyo.
  window.__maybePowerUp = function (pair) {
    if (!pair || !pair.puyos || pair.puyos.length === 0) return;
    if (Math.random() > 0.12) return;
    const target = pair.puyos[Math.floor(Math.random() * pair.puyos.length)];
    if (Math.random() < 0.55) {
      target.isBomb = true;
    } else {
      target.isRainbow = true;
      target.color = '#ffffff';
    }
  };

  // ---------- PARTICLES ----------
  const particles = [];
  function spawnBurst(px, py, color, n = 14, speed = 5) {
    if (!settings.particles) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.9);
      particles.push({
        x: px, y: py,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1, decay: 0.02 + Math.random() * 0.02,
        size: 2 + Math.random() * 3,
        color
      });
    }
  }
  window.__particlesUpdate = function (dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.18; p.vx *= 0.97;
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  };
  window.__particlesDraw = function () {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };
  window.__spawnExplosionFx = function (gx, gy, color = '#ff8800') {
    const cx = gx * TILE + TILE / 2;
    const cy = gy * TILE + TILE / 2;
    spawnBurst(cx, cy, color, 28, 8);
    beep(110, 0.25, 'sawtooth', 1.4);
    flipShake(14, 320);
  };

  // ---------- SCREEN SHAKE (additive, decays over time) ----------
  let shakeAmp = 0, shakeTimeLeft = 0;
  function flipShake(amp, durMs) {
    shakeAmp = Math.max(shakeAmp, amp);
    shakeTimeLeft = Math.max(shakeTimeLeft, durMs);
  }
  // Hook into the existing screenShakeX/Y by patching them each frame.
  (function shakeLoop(prev) {
    function tick() {
      if (shakeTimeLeft > 0) {
        const k = shakeTimeLeft / 320;
        const a = shakeAmp * k;
        screenShakeX = (Math.random() - 0.5) * a;
        screenShakeY = (Math.random() - 0.5) * a;
        shakeTimeLeft -= 16;
        if (shakeTimeLeft <= 0) shakeAmp = 0;
      }
      requestAnimationFrame(tick);
    }
    tick();
  })();

  // ---------- GRAVITY FLIP IMPACT ----------
  window.__onGravityFlip = function (rotatingBox) {
    flipShake(18, 380);
    beep(220, 0.18, 'sawtooth', 1.2);
    setTimeout(() => beep(140, 0.22, 'square', 1.2), 80);
    if (!settings.particles) return;
    // Spawn sparks along the wall the blocks just slammed into.
    const w = canvas.width, h = canvas.height;
    const burstAt = (x, y) => spawnBurst(x, y, '#ffcc00', 6, 4);
    // Top edge (since rotation slams everything down)
    for (let i = 0; i < 12; i++) burstAt(Math.random() * w, h - 6);
  };

  // ---------- CHAIN JUICE ----------
  window.__onChainJuice = function (chain, popped, cells) {
    flipShake(6 + chain * 3, 220 + chain * 60);
    beep(440 + chain * 80, 0.12, 'triangle', 1);
    if (settings.particles) {
      cells.forEach(p => {
        const cx = p.x * TILE + TILE / 2;
        const cy = p.y * TILE + TILE / 2;
        spawnBurst(cx, cy, p.color || '#ffffff', 8, 3.5);
      });
    }
  };
  window.__onScoreGain = function (gained, chain) {
    const label = (chain > 1 ? `+${gained}  x${chain}` : `+${gained}`);
    floatingTexts.push(new FloatingText(label, canvas.width / 2, 250, chain > 1 ? '#FFCC00' : '#00FF88'));
  };

  // ---------- DAILY CHALLENGE ----------
  function mulberry32(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function todaySeed() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  window.__seedDaily = function () { window.__dailyRNG = mulberry32(todaySeed()); };

  // Daily leaderboard
  const DKEY = 'puyo.daily.v1';
  function loadDaily() { return safeJSON(localStorage.getItem(DKEY)) || {}; }
  function saveDaily(o) { localStorage.setItem(DKEY, JSON.stringify(o)); }
  function recordDaily(value) {
    const all = loadDaily();
    const k = todayKey();
    const list = all[k] || [];
    list.push({ score: value, date: new Date().toISOString() });
    list.sort((a, b) => b.score - a.score);
    all[k] = list.slice(0, 10);
    saveDaily(all);
  }

  // Hook existing onGameOver to handle daily
  const _origOnGameOver = window.onGameOver;
  window.onGameOver = function (mode, finalScore) {
    if (typeof _origOnGameOver === 'function') _origOnGameOver(mode, finalScore);
    if (mode === 'daily') recordDaily(finalScore);
    refreshDailyPanel();
  };

  // ---------- UI INJECTIONS ----------
  function injectMenuExtras() {
    const menu = document.getElementById('menu-overlay');
    if (!menu) return;
    const modal = menu.querySelector('.modal-content');
    if (!modal || modal.querySelector('#daily-mode-btn')) return;

    // Daily button (matches existing button styling)
    const dailyBtn = document.createElement('button');
    dailyBtn.id = 'daily-mode-btn';
    dailyBtn.innerText = 'DAILY CHALLENGE';
    modal.appendChild(dailyBtn);
    dailyBtn.onclick = () => {
      window.__seedDaily();
      if (typeof startGame === 'function') startGame('daily');
    };

    // Daily badge in UI bar
    const ui = document.getElementById('ui');
    if (ui && !document.getElementById('daily-badge')) {
      const badge = document.createElement('div');
      badge.id = 'daily-badge';
      badge.innerText = '';
      ui.appendChild(badge);
    }
  }

  // Show daily badge when in daily mode
  setInterval(() => {
    const badge = document.getElementById('daily-badge');
    if (!badge) return;
    badge.innerText = (gameMode === 'daily' && gameState === 'playing')
      ? `DAILY • ${todayKey()}` : '';
  }, 400);

  // ---------- SETTINGS PANEL ----------
  function injectSettings() {
    if (document.getElementById('settings-gear')) return;

    const gear = document.createElement('button');
    gear.id = 'settings-gear';
    gear.innerHTML = '⚙';
    gear.title = 'Settings';
    document.body.appendChild(gear);

    const overlay = document.createElement('div');
    overlay.id = 'settings-overlay';
    overlay.className = 'overlay-modal frosted';
    overlay.style.position = 'fixed';
    overlay.style.zIndex = '700';
    overlay.innerHTML = `
      <div class="modal-content">
        <h2>SETTINGS</h2>
        <div class="setting-row">
          <label for="set-sfx">SFX volume</label>
          <input id="set-sfx" type="range" min="0" max="1" step="0.05" value="${settings.sfx}">
        </div>
        <div class="setting-row">
          <label>Particles</label>
          <div id="set-particles" class="toggle ${settings.particles ? 'on' : ''}"></div>
        </div>
        <div class="setting-row">
          <label>Colorblind palette</label>
          <div id="set-cb" class="toggle ${settings.colorblind ? 'on' : ''}"></div>
        </div>
        <button id="set-close">CLOSE</button>
      </div>
    `;
    document.body.appendChild(overlay);

    gear.onclick = () => overlay.classList.add('show');
    overlay.querySelector('#set-close').onclick = () => overlay.classList.remove('show');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('show');
    });

    overlay.querySelector('#set-sfx').oninput = (e) => {
      settings.sfx = parseFloat(e.target.value); saveSettings(); beep(660, 0.06);
    };
    overlay.querySelector('#set-particles').onclick = (e) => {
      settings.particles = !settings.particles; saveSettings();
      e.currentTarget.classList.toggle('on', settings.particles);
    };
    overlay.querySelector('#set-cb').onclick = (e) => {
      settings.colorblind = !settings.colorblind; saveSettings();
      e.currentTarget.classList.toggle('on', settings.colorblind);
      applyColorblind();
    };
  }

  // ---------- DAILY LEADERBOARD PANEL ----------
  function injectDailyPanel() {
    const meta = document.getElementById('meta-panel');
    if (!meta || document.getElementById('daily-panel-section')) return;
    const section = document.createElement('div');
    section.id = 'daily-panel-section';
    meta.appendChild(section);
    refreshDailyPanel();
  }
  function refreshDailyPanel() {
    const section = document.getElementById('daily-panel-section');
    if (!section) return;
    const all = loadDaily();
    const list = all[todayKey()] || [];
    const rows = list.length
      ? list.slice(0, 5).map((r, i) =>
          `<li style="display:flex;justify-content:space-between;opacity:${1 - i*0.12}">
             <span>#${i+1}</span><span>${r.score}</span></li>`).join('')
      : `<li style="opacity:0.5">— play today's run —</li>`;
    section.innerHTML = `
      <div style="font-size:20px;color:#ffcc00;margin:14px 0 6px;text-align:center">
        DAILY (${todayKey()})
      </div>
      <ol style="list-style:none;padding:0;margin:0;font-size:14px;line-height:1.5">${rows}</ol>
    `;
  }

  // ---------- MOBILE TOUCH CONTROLS ----------
  function injectTouchControls() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    let startX = 0, startY = 0, startT = 0, lastMoveX = 0, moved = false;
    const TH = 24; // px per cell swipe

    canvas.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      startX = lastMoveX = t.clientX; startY = t.clientY; startT = Date.now(); moved = false;
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (gameState !== 'playing' || isPaused || isCinematicActive) return;
      const t = e.touches[0];
      const dx = t.clientX - lastMoveX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > TH) {
        if (gameMode === 'vs') return;
        moveActive(dx > 0 ? 1 : -1, 0);
        lastMoveX = t.clientX; moved = true;
      }
      if (dy > 80) {
        // soft-drop accelerator
        if (currentPair) moveActive(0, 1);
        moved = true;
      }
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      if (gameState !== 'playing' || isPaused || isCinematicActive) return;
      const dt = Date.now() - startT;
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      const totalDy = t ? (t.clientY - startY) : 0;
      if (!moved && dt < 250) {
        // tap = rotate clockwise (avoid VS to keep it simple)
        if (gameMode !== 'vs') rotatePair(1);
      } else if (totalDy < -60 && dt < 350) {
        // swipe up = hard drop
        if (gameMode !== 'vs') {
          while (currentPair) { if (!moveActive(0, 1)) break; }
        }
      }
    });

    if (isTouch) {
      const hint = document.createElement('div');
      hint.id = 'touch-hint';
      hint.className = 'show';
      hint.innerText = 'TAP rotate • SWIPE move • SWIPE UP hard-drop';
      document.body.appendChild(hint);
    }
  }

  // ---------- BOOT ----------
  function boot() {
    injectMenuExtras();
    injectSettings();
    injectDailyPanel();
    injectTouchControls();
    // Re-run meta panel inject in case order races
    setTimeout(() => { injectDailyPanel(); injectMenuExtras(); }, 300);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
