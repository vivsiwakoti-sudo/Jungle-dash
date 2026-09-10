/* Jungle Dash: a small Canvas platformer with data-driven level pieces. */
(() => {
  'use strict';
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = 1280, H = 720, FLOOR = 646;
  const ui = Object.fromEntries(['hud','menuScreen','pauseScreen','gameOverScreen','completeScreen','toast','hearts','coinCount','gemCount','score','timer','finalScore','finalCoins','finalGems','finalTime','pauseButton'].map(id => [id, document.getElementById(id)]));
  const keys = new Set();
  let last = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const rnd = (min, max) => min + Math.random() * (max - min);
  const roundedRect = (g, x, y, w, h, radius) => {
    const r = Math.min(radius, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };

  class ParticleSystem {
    constructor() { this.items = []; }
    burst(x, y, color, amount = 10) { for (let i = 0; i < amount; i++) this.items.push({ x, y, vx: rnd(-140, 140), vy: rnd(-210, -40), life: rnd(.35, .75), max: .7, color, size: rnd(3, 7) }); }
    update(dt) { this.items.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.life -= dt; }); this.items = this.items.filter(p => p.life > 0); }
    draw(g, camera) { this.items.forEach(p => { g.globalAlpha = clamp(p.life / p.max, 0, 1); g.fillStyle = p.color; g.fillRect(p.x - camera.x, p.y - camera.y, p.size, p.size); }); g.globalAlpha = 1; }
  }

  class Platform {
    constructor(x, y, w, h = 24, moving = false) { Object.assign(this, { x, y, w, h, moving, startX: x, range: moving ? 120 : 0, phase: rnd(0, 6) }); }
    update(dt, time) { if (this.moving) this.x = this.startX + Math.sin(time * 1.2 + this.phase) * this.range; }
    draw(g, camera) { const x = this.x - camera.x, y = this.y - camera.y; g.fillStyle = '#55a251'; g.fillRect(x, y, this.w, 8); g.fillStyle = '#704934'; g.fillRect(x + 4, y + 8, this.w - 8, this.h - 8); g.fillStyle = '#8c5e3e'; for (let i = 12; i < this.w - 8; i += 28) g.fillRect(x + i, y + 13, 3, 7); }
  }

  class Collectible {
    constructor(x, y, type) { Object.assign(this, { x, y, type, w: 22, h: 28, alive: true, phase: rnd(0, 6) }); }
    update(dt) { this.phase += dt * 4; }
    draw(g, camera) { if (!this.alive) return; const bob = Math.sin(this.phase) * 4, x = this.x - camera.x, y = this.y - camera.y + bob; g.save(); g.shadowBlur = 15; g.shadowColor = this.type === 'coin' ? '#f6c453' : '#66dfd0'; g.fillStyle = this.type === 'coin' ? '#f6c453' : '#72ded1'; g.translate(x + 11, y + 14); g.rotate(this.type === 'coin' ? Math.sin(this.phase) * .25 : .78); g.beginPath(); if (this.type === 'coin') g.ellipse(0, 0, 9 * Math.abs(Math.cos(this.phase)), 13, 0, 0, Math.PI * 2); else { g.moveTo(0, -14); g.lineTo(10, 0); g.lineTo(0, 14); g.lineTo(-10, 0); g.closePath(); } g.fill(); g.restore(); }
  }

  class PowerUp {
    constructor(x, y, type) { Object.assign(this, { x, y, type, w: 26, h: 26, alive: true, phase: rnd(0, 6) }); }
    update(dt) { this.phase += dt * 3; }
    draw(g, camera) { if (!this.alive) return; const x = this.x - camera.x, y = this.y - camera.y + Math.sin(this.phase) * 5; g.save(); g.shadowBlur = 18; g.shadowColor = this.type === 'speed' ? '#ef6f55' : '#70e1d1'; g.fillStyle = this.type === 'speed' ? '#ef6f55' : '#70e1d1'; g.beginPath(); g.arc(x + 13, y + 13, 12, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff9e9'; g.font = 'bold 15px DM Sans'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(this.type === 'speed' ? '»' : '◇', x + 13, y + 13); g.restore(); }
  }

  class Enemy {
    constructor(x, y, kind = 'slime') { Object.assign(this, { x, y, kind, w: kind === 'bug' ? 34 : 42, h: kind === 'bug' ? 25 : 30, vx: kind === 'bug' ? 55 : 48, startY: y, phase: rnd(0, 6), alive: true, direction: 1 }); }
    update(dt, level) { if (!this.alive) return; this.phase += dt * 3; if (this.kind === 'bug') { this.x += this.vx * this.direction * dt; this.y = this.startY + Math.sin(this.phase) * 25; if (this.x < 520 || this.x > 2100) this.direction *= -1; return; } this.x += this.vx * this.direction * dt; const ground = level.platforms.find(p => this.x + this.w > p.x && this.x < p.x + p.w && Math.abs(this.y + this.h - p.y) < 8); if (!ground || this.x < ground.x || this.x + this.w > ground.x + ground.w) this.direction *= -1; }
    draw(g, camera) { if (!this.alive) return; const x = this.x - camera.x, y = this.y - camera.y + Math.sin(this.phase) * 2; g.save(); g.fillStyle = this.kind === 'bug' ? '#ba72ce' : '#ed7659'; g.beginPath(); if (this.kind === 'bug') { g.ellipse(x + 17, y + 13, 17, 10, 0, 0, Math.PI * 2); g.fillStyle = '#f2b9e9'; g.ellipse(x + 4, y + 7, 10, 7, -.3, 0, Math.PI * 2); g.ellipse(x + 30, y + 7, 10, 7, .3, 0, Math.PI * 2); } else { roundedRect(g, x, y + 5, this.w, this.h - 5, 13); } g.fill(); g.fillStyle = '#173d36'; g.fillRect(x + 10, y + 12, 4, 6); g.fillRect(x + this.w - 14, y + 12, 4, 6); g.restore(); }
  }

  class Player {
    constructor() { this.w = 32; this.h = 58; this.reset(100, 570); }
    reset(x, y) { Object.assign(this, { x, y, vx: 0, vy: 0, grounded: false, coyote: 0, jumpBuffer: 0, invuln: 0, facing: 1, squash: 1, speedBoost: 0, shield: false }); }
    update(dt, game) {
      const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
      const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
      const axis = (right ? 1 : 0) - (left ? 1 : 0);
      const max = this.speedBoost > 0 ? 390 : 285;
      if (axis) { this.vx += axis * 1750 * dt; this.facing = axis; } else this.vx *= Math.pow(.001, dt);
      this.vx = clamp(this.vx, -max, max);
      this.speedBoost = Math.max(0, this.speedBoost - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.coyote = this.grounded ? .1 : Math.max(0, this.coyote - dt);
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      if (this.jumpBuffer && (this.grounded || this.coyote > 0)) { this.vy = -650; this.grounded = false; this.jumpBuffer = 0; game.audio.beep(440, .08); }
      this.vy += 1750 * dt; const oldY = this.y; this.x += this.vx * dt; this.y += this.vy * dt; this.grounded = false; game.level.platforms.forEach(p => { if (this.x + this.w > p.x && this.x < p.x + p.w && oldY + this.h <= p.y + 4 && this.y + this.h >= p.y && this.vy >= 0) { this.y = p.y - this.h; this.vy = 0; this.grounded = true; this.squash = 1.16; } }); this.x = clamp(this.x, 0, game.level.width - this.w); this.squash += (1 - this.squash) * dt * 9; if (this.y > H + 120) game.damage(true);
    }
    jump() { this.jumpBuffer = .13; }
    draw(g, camera) {
      const x = this.x - camera.x;
      const y = this.y - camera.y;
      const run = Math.sin(performance.now() / 85) * Math.min(4, Math.abs(this.vx) / 50);
      const centerX = x + this.w / 2;
      const feetY = y + this.h;
      g.save();
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#173d36';
      g.fillRect(centerX - 12, feetY - 8, 9, 8);
      g.fillRect(centerX + 4, feetY - 8, 9, 8);
      g.fillStyle = '#ef6f55';
      g.fillRect(centerX - 15, feetY - 53, 30, 40);
      g.fillStyle = '#f2ad70';
      g.beginPath();
      g.arc(centerX, feetY - 62, 17, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1a5145';
      g.beginPath();
      g.arc(centerX, feetY - 68, 18, Math.PI, Math.PI * 2);
      g.fill();
      g.fillStyle = '#173d36';
      g.fillRect(centerX - 7, feetY - 64, 4, 5);
      g.fillRect(centerX + 4, feetY - 64, 4, 5);
      g.fillStyle = '#f6c453';
      g.fillRect(centerX - 15, feetY - 45 + run, 30, 7);
      if (this.shield) {
        g.strokeStyle = '#70e1d1';
        g.lineWidth = 3;
        g.globalAlpha = .7;
        g.beginPath();
        g.arc(centerX, feetY - 34, 30, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    }
  }

  class Camera { constructor() { this.x = 0; this.shake = 0; } update(dt, player, level) { const target = clamp(player.x - W * .42, 0, level.width - W); this.x += (target - this.x) * Math.min(1, dt * 5); this.shake = Math.max(0, this.shake - dt); } }

  class Level {
    constructor() { this.width = 4400; this.platforms = []; this.items = []; this.powerUps = []; this.enemies = []; this.checkpoints = [{ x: 100, active: true }, { x: 1250, active: false }, { x: 2750, active: false }]; this.hazards = [{ x: 940, y: FLOOR - 18, w: 115, h: 18 }, { x: 2040, y: FLOOR - 18, w: 100, h: 18 }, { x: 3370, y: FLOOR - 18, w: 130, h: 18 }]; this.finish = { x: 4190, y: 535, w: 70, h: 110 }; this.build(); }
    build() { const add = (x, y, w, h = 24, moving = false) => this.platforms.push(new Platform(x, y, w, h, moving)); [[0,FLOOR,700],[1050,FLOOR,790],[2140,FLOOR,1230],[3500,FLOOR,900],[300,520,190],[570,430,170],[805,540,150],[1180,520,170],[1430,445,170],[1700,550,170],[1850,390,150],[2250,500,210],[2540,410,180],[2820,535,170],[3030,445,180],[3280,360,150],[3570,510,180],[3840,425,190],[4050,350,150]].forEach(p => add(...p)); add(2010, 315, 150, 22, true); add(2320, 355, 130, 22, true); const coins = [[170,570],[260,570],[350,478],[610,387],[840,497],[1100,570],[1230,477],[1480,402],[1740,507],[1880,347],[2180,570],[2290,457],[2580,367],[2860,492],[3070,402],[3315,317],[3610,467],[3880,382],[4100,307]]; coins.forEach(p => this.items.push(new Collectible(...p, 'coin'))); [[680,350],[1510,340],[2700,300],[3690,390]].forEach(p => this.items.push(new Collectible(...p, 'gem'))); [[520,475,'speed'],[2800,475,'shield']].forEach(p => this.powerUps.push(new PowerUp(...p))); [[470,490,'slime'],[690,490,'slime'],[1300,490,'slime'],[1780,520,'slime'],[2390,440,'bug'],[2940,475,'slime'],[3160,385,'bug'],[3760,450,'slime'],[3970,365,'bug']].forEach(e => this.enemies.push(new Enemy(...e))); }
  }

  class Audio { constructor() { this.ctx = null; } beep(frequency, duration) { try { this.ctx ||= new AudioContext(); const osc = this.ctx.createOscillator(), gain = this.ctx.createGain(); osc.frequency.value = frequency; gain.gain.setValueAtTime(.04, this.ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + duration); osc.connect(gain).connect(this.ctx.destination); osc.start(); osc.stop(this.ctx.currentTime + duration); } catch (_) {} } }

  class Game {
    constructor() { this.state = 'MENU'; this.level = new Level(); this.player = new Player(); this.camera = new Camera(); this.particles = new ParticleSystem(); this.audio = new Audio(); this.score = 0; this.coins = 0; this.gems = 0; this.enemiesDefeated = 0; this.health = 3; this.elapsed = 0; this.respawn = { x: 100, y: 570 }; this.toastTimer = 0; this.bind(); this.resize(); requestAnimationFrame(t => this.loop(t)); }
    bind() { window.addEventListener('resize', () => this.resize()); window.addEventListener('keydown', e => { const key = e.key.toLowerCase(); if (['arrowleft','arrowright','arrowup',' ','a','d','w','escape'].includes(e.key.toLowerCase())) e.preventDefault(); if (key === 'escape') { if (this.state === 'PLAYING') this.setState('PAUSED'); else if (this.state === 'PAUSED') this.setState('PLAYING'); } if ([' ','arrowup','w'].includes(key) || e.key === 'ArrowUp' || e.key === ' ') this.player.jump(); keys.add(e.key); keys.add(key); }); window.addEventListener('keyup', e => { keys.delete(e.key); keys.delete(e.key.toLowerCase()); }); document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => this.action(button.dataset.action))); ui.pauseButton.addEventListener('click', () => this.setState('PAUSED')); }
    resize() { const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    action(action) { if (action === 'play' || action === 'restart') this.start(); if (action === 'resume') this.setState('PLAYING'); if (action === 'menu') this.setState('MENU'); if (action === 'next') this.toast('More trails are coming soon!'); if (['character','levels','settings'].includes(action)) this.toast(`${action[0].toUpperCase() + action.slice(1)} is coming soon`); }
    start() { this.level = new Level(); this.player.reset(100, 570); this.camera.x = 0; this.score = this.coins = this.gems = this.enemiesDefeated = 0; this.health = 3; this.elapsed = 0; this.respawn = { x: 100, y: 570 }; this.setState('PLAYING'); }
    setState(state) { this.state = state; ui.menuScreen.classList.toggle('hidden', state !== 'MENU'); ui.hud.classList.toggle('hidden', state === 'MENU'); ui.pauseScreen.classList.toggle('hidden', state !== 'PAUSED'); ui.gameOverScreen.classList.toggle('hidden', state !== 'GAME_OVER'); ui.completeScreen.classList.toggle('hidden', state !== 'LEVEL_COMPLETE'); }
    toast(message) { ui.toast.textContent = message; ui.toast.classList.add('show'); this.toastTimer = 2; }
    damage(pit = false) { if (this.player.invuln > 0 || this.state !== 'PLAYING') return; if (this.player.shield && !pit) { this.player.shield = false; this.player.invuln = 1.2; this.toast('Shield absorbed the hit'); this.particles.burst(this.player.x + 16, this.player.y + 25, '#70e1d1', 14); return; } this.health--; this.player.invuln = 1.5; this.camera.shake = .35; this.audio.beep(130, .16); this.particles.burst(this.player.x + 16, this.player.y + 25, '#ef6f55', 12); if (this.health <= 0) { this.setState('GAME_OVER'); return; } this.player.reset(this.respawn.x, this.respawn.y); }
    update(dt) { if (this.state !== 'PLAYING') return; this.elapsed += dt; this.level.platforms.forEach(p => p.update(dt, this.elapsed)); this.level.items.forEach(item => item.update(dt)); this.level.powerUps.forEach(powerUp => powerUp.update(dt)); this.level.enemies.forEach(e => e.update(dt, this.level)); this.player.update(dt, this); this.level.items.forEach(item => { if (item.alive && overlap(this.player, item)) { item.alive = false; if (item.type === 'coin') { this.coins++; this.score += 10; this.audio.beep(700, .06); this.particles.burst(item.x + 11, item.y + 14, '#f6c453', 8); } else { this.gems++; this.score += 50; this.audio.beep(900, .1); this.particles.burst(item.x + 11, item.y + 14, '#70e1d1', 14); } } }); this.level.powerUps.forEach(powerUp => { if (powerUp.alive && overlap(this.player, powerUp)) { powerUp.alive = false; if (powerUp.type === 'speed') { this.player.speedBoost = 8; this.toast('Speed boost!'); } else { this.player.shield = true; this.toast('Shield ready!'); } this.audio.beep(520, .16); this.particles.burst(powerUp.x + 13, powerUp.y + 13, powerUp.type === 'speed' ? '#ef6f55' : '#70e1d1', 14); } }); this.level.enemies.forEach(enemy => { if (!enemy.alive || !overlap(this.player, enemy)) return; const stomp = this.player.vy > 0 && this.player.y + this.player.h - enemy.y < 20 && enemy.kind !== 'bug'; if (stomp) { enemy.alive = false; this.player.vy = -420; this.score += 100; this.enemiesDefeated++; this.particles.burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, '#f6c453', 16); } else this.damage(); }); this.level.hazards.forEach(h => { if (overlap(this.player, h)) this.damage(); }); this.level.checkpoints.forEach(cp => { if (!cp.active && this.player.x > cp.x) { cp.active = true; this.respawn = { x: cp.x + 30, y: 570 }; this.toast('Checkpoint!'); this.audio.beep(620, .12); } }); if (this.player.x + this.player.w > this.level.finish.x) this.complete(); this.camera.update(dt, this.player, this.level); this.particles.update(dt); this.toastTimer -= dt; if (this.toastTimer <= 0) ui.toast.classList.remove('show'); this.updateHud(); }
    complete() { this.score += Math.max(0, 600 - Math.floor(this.elapsed) * 3); ui.finalScore.textContent = this.score.toLocaleString(); ui.finalCoins.textContent = this.coins; ui.finalGems.textContent = this.gems; ui.finalTime.textContent = formatTime(this.elapsed); this.setState('LEVEL_COMPLETE'); this.audio.beep(880, .25); }
    updateHud() { ui.hearts.innerHTML = [0,1,2].map(i => `<span class="heart ${i >= this.health ? 'empty' : ''}">♥</span>`).join(''); ui.coinCount.textContent = String(this.coins).padStart(3, '0'); ui.gemCount.textContent = this.gems; ui.score.textContent = this.score.toLocaleString().padStart(4, '0'); ui.timer.textContent = formatTime(this.elapsed); }
    drawBackground() { const gradient = ctx.createLinearGradient(0, 0, 0, H); gradient.addColorStop(0, '#8bd2c1'); gradient.addColorStop(.62, '#d6e8b2'); gradient.addColorStop(1, '#74b66e'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#c8ead0'; for (let i = -1; i < 9; i++) { const x = i * 190 - (this.camera.x * .12 % 190); ctx.beginPath(); ctx.arc(x + 55, 170, 80, Math.PI, 0); ctx.fill(); } ctx.fillStyle = '#5ba376'; for (let i = -1; i < 9; i++) { const x = i * 210 - (this.camera.x * .25 % 210); ctx.beginPath(); ctx.arc(x, 470, 160, Math.PI, 0); ctx.fill(); } ctx.fillStyle = '#2f7658'; for (let i = -1; i < 12; i++) { const x = i * 145 - (this.camera.x * .4 % 145); ctx.fillRect(x, 270, 18, 300); ctx.beginPath(); ctx.arc(x + 9, 260, 70, 0, Math.PI * 2); ctx.fill(); } }
    drawWorld() { const c = this.camera, shakeX = this.camera.shake ? rnd(-5, 5) : 0; ctx.save(); ctx.translate(shakeX, this.camera.shake ? rnd(-4, 4) : 0); this.drawBackground(); ctx.fillStyle = '#b5d889'; ctx.fillRect(0, FLOOR - 2, W, H - FLOOR + 2); ctx.fillStyle = '#7fbd6a'; ctx.fillRect(0, FLOOR - 7, W, 8); this.level.hazards.forEach(h => { const x = h.x - c.x; ctx.fillStyle = '#e8f0d0'; for (let i = 0; i < h.w; i += 22) { ctx.beginPath(); ctx.moveTo(x + i, h.y + 18); ctx.lineTo(x + i + 11, h.y - 3); ctx.lineTo(x + i + 22, h.y + 18); ctx.fill(); } }); this.level.platforms.forEach(p => p.draw(ctx, c)); this.level.items.forEach(item => item.draw(ctx, c)); this.level.powerUps.forEach(powerUp => powerUp.draw(ctx, c)); this.level.enemies.forEach(e => e.draw(ctx, c)); this.level.checkpoints.forEach(cp => { const x = cp.x - c.x; ctx.strokeStyle = '#704934'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, 600); ctx.lineTo(x, 455); ctx.stroke(); ctx.fillStyle = cp.active ? '#f6c453' : '#72b58a'; ctx.beginPath(); ctx.moveTo(x + 2, 460); ctx.lineTo(x + 60, 480); ctx.lineTo(x + 2, 500); ctx.fill(); }); const fx = this.level.finish.x - c.x; ctx.strokeStyle = '#704934'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(fx + 15, 645); ctx.lineTo(fx + 15, 515); ctx.stroke(); ctx.fillStyle = '#ef6f55'; ctx.beginPath(); ctx.moveTo(fx + 17, 518); ctx.lineTo(fx + 78, 535); ctx.lineTo(fx + 17, 554); ctx.fill(); ctx.fillStyle = '#f6c453'; ctx.fillRect(fx + 7, 645, 80, 10); this.particles.draw(ctx, c); this.player.draw(ctx, c); ctx.restore(); }
    draw() { this.drawWorld(); }
    loop(timestamp) { const dt = Math.min(.033, (timestamp - last) / 1000 || 0); last = timestamp; this.update(dt); this.draw(); requestAnimationFrame(t => this.loop(t)); }
  }
  const game = new Game();
})();
