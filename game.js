(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const ui = {
    score: document.getElementById("score"), coins: document.getElementById("coins"), speed: document.getElementById("speed"),
    start: document.getElementById("startScreen"), pause: document.getElementById("pauseScreen"), over: document.getElementById("gameOverScreen"),
    finalScore: document.getElementById("finalScore"), bestScore: document.getElementById("bestScore"), finalCoins: document.getElementById("finalCoins")
  };

  let w = 0, h = 0, dpr = 1, last = 0, time = 0, state = "menu";
  let score = 0, coins = 0, speed = 0.42, spawnTimer = 0, shake = 0, flash = 0;
  let objects = [], particles = [], buildings = [];
  const player = { lane: 0, laneVisual: 0, jump: 0, jumpV: 0, sliding: 0, run: 0 };

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2); w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildings = Array.from({ length: 34 }, (_, i) => ({ x: i / 33, width: .025 + Math.random() * .055, height: .08 + Math.random() * .28, hue: Math.random() > .5 ? 188 : 326 }));
  }

  const horizon = () => h * .29;
  function perspective(z, lane = 0) {
    const p = Math.max(0, Math.min(1, 1 - z));
    const eased = p * p;
    const roadHalf = w * (.055 + eased * .44);
    return { x: w / 2 + lane * roadHalf * .47, y: horizon() + eased * h * .76, scale: .12 + eased * 1.18, roadHalf, p: eased };
  }

  function reset() {
    score = coins = time = 0; speed = .42; spawnTimer = .8; objects = []; particles = [];
    Object.assign(player, { lane: 0, laneVisual: 0, jump: 0, jumpV: 0, sliding: 0, run: 0 });
    ui.score.textContent = "000000"; ui.coins.textContent = "0"; ui.speed.textContent = "1.0×";
  }

  function start() { reset(); state = "playing"; ui.start.classList.remove("visible"); ui.over.classList.remove("visible"); last = performance.now(); }
  function togglePause() {
    if (state === "playing") { state = "paused"; ui.pause.classList.add("visible"); }
    else if (state === "paused") { state = "playing"; ui.pause.classList.remove("visible"); last = performance.now(); requestAnimationFrame(loop); }
  }
  function gameOver() {
    state = "over"; shake = 18; flash = 1;
    const final = Math.floor(score), best = Math.max(final, Number(localStorage.getItem("neonRushBest") || 0));
    localStorage.setItem("neonRushBest", best);
    ui.finalScore.textContent = final.toLocaleString(); ui.bestScore.textContent = best.toLocaleString(); ui.finalCoins.textContent = coins;
    setTimeout(() => ui.over.classList.add("visible"), 360);
  }

  function move(dir) { if (state === "playing") player.lane = Math.max(-1, Math.min(1, player.lane + dir)); }
  function jump() { if (state === "playing" && player.jump === 0) { player.jumpV = 2.15; player.sliding = 0; } }
  function slide() { if (state === "playing" && player.jump < .08) player.sliding = .62; }

  function spawnPattern() {
    const difficulty = Math.min(1, score / 8500);
    const freeLane = Math.floor(Math.random() * 3) - 1;
    const roll = Math.random();
    if (roll < .35) {
      objects.push({ type: "barrier", lane: -1 - freeLane === 0 ? 1 : -1, z: 1.02, hit: false });
      objects.push({ type: "barrier", lane: freeLane === 1 ? 0 : 1, z: 1.05, hit: false });
    } else if (roll < .58) {
      objects.push({ type: "train", lane: freeLane === 0 ? (Math.random() > .5 ? -1 : 1) : 0, z: 1.06, hit: false });
    } else if (roll < .76 && difficulty > .18) {
      objects.push({ type: "sign", lane: Math.floor(Math.random() * 3) - 1, z: 1.04, hit: false });
    } else {
      objects.push({ type: "barrier", lane: Math.floor(Math.random() * 3) - 1, z: 1.04, hit: false });
    }
    for (let i = 0; i < 6; i++) objects.push({ type: "coin", lane: freeLane, z: 1.18 + i * .095, hit: false, bob: Math.random() * 6.28 });
  }

  function update(dt) {
    time += dt; speed = Math.min(.82, .42 + score / 24000); score += dt * speed * 430;
    player.run += dt * (9 + speed * 8); player.laneVisual += (player.lane - player.laneVisual) * Math.min(1, dt * 11);
    if (player.jumpV || player.jump > 0) { player.jump += player.jumpV * dt; player.jumpV -= 5.2 * dt; if (player.jump <= 0) { player.jump = 0; player.jumpV = 0; } }
    player.sliding = Math.max(0, player.sliding - dt);
    spawnTimer -= dt; if (spawnTimer <= 0) { spawnPattern(); spawnTimer = Math.max(.68, 1.22 - score / 16000) + Math.random() * .25; }

    for (const o of objects) {
      o.z -= speed * dt;
      if (o.hit || o.z > .16 || o.z < -.12 || o.lane !== player.lane) continue;
      if (o.type === "coin") { o.hit = true; coins++; score += 125; burst(o.lane, o.z, "#ffd21c"); continue; }
      const safe = (o.type === "barrier" && player.jump > .31) || (o.type === "sign" && player.sliding > 0);
      if (!safe) { o.hit = true; gameOver(); }
    }
    objects = objects.filter(o => o.z > -.18 && !(o.hit && o.type === "coin"));
    particles.forEach(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; });
    particles = particles.filter(p => p.life > 0); shake *= .86; flash *= .9;
    ui.score.textContent = String(Math.floor(score)).padStart(6, "0"); ui.coins.textContent = coins; ui.speed.textContent = (speed / .42).toFixed(1) + "×";
  }

  function burst(lane, z, color) {
    const p = perspective(z, lane);
    for (let i = 0; i < 10; i++) particles.push({ x: p.x, y: p.y - 35 * p.scale, vx: (Math.random() - .5) * 180, vy: -40 - Math.random() * 130, life: .35 + Math.random() * .3, color });
  }

  function roundedRect(x, y, width, height, r) { ctx.beginPath(); ctx.roundRect(x, y, width, height, r); }
  function drawWorld() {
    const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#071126"); sky.addColorStop(.48, "#173956"); sky.addColorStop(1, "#ff4f75"); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * .5, horizon(), 10, w * .5, horizon(), w * .44); glow.addColorStop(0, "rgba(255,190,76,.75)"); glow.addColorStop(1, "rgba(255,54,122,0)"); ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h * .75);

    ctx.fillStyle = "#0a1728";
    for (const b of buildings) {
      const x = b.x * w, bw = b.width * w, bh = b.height * h;
      ctx.fillRect(x, horizon() - bh, bw, bh);
      ctx.fillStyle = `hsla(${b.hue}, 95%, 65%, .55)`;
      for (let yy = horizon() - bh + 9; yy < horizon() - 6; yy += 13) for (let xx = x + 6; xx < x + bw - 4; xx += 12) if ((xx + yy) % 3 > 1) ctx.fillRect(xx, yy, 3, 5);
      ctx.fillStyle = "#0a1728";
    }

    ctx.beginPath(); ctx.moveTo(w * .445, horizon()); ctx.lineTo(-w * .05, h); ctx.lineTo(w * 1.05, h); ctx.lineTo(w * .555, horizon()); ctx.closePath();
    const road = ctx.createLinearGradient(0, horizon(), 0, h); road.addColorStop(0, "#1d2632"); road.addColorStop(1, "#080c13"); ctx.fillStyle = road; ctx.fill();
    ctx.strokeStyle = "rgba(49,230,255,.55)"; ctx.lineWidth = 2;
    for (const laneEdge of [-1.5, -.5, .5, 1.5]) { const top = perspective(1, laneEdge), bottom = perspective(0, laneEdge); ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bottom.x, bottom.y); ctx.stroke(); }

    const scroll = (time * speed * 1.8) % .12;
    for (let z = scroll; z < 1; z += .12) {
      const p = perspective(z); ctx.strokeStyle = `rgba(255,255,255,${.06 + p.p * .18})`; ctx.lineWidth = 1 + p.p * 5;
      ctx.beginPath(); ctx.moveTo(w / 2 - p.roadHalf, p.y); ctx.lineTo(w / 2 + p.roadHalf, p.y); ctx.stroke();
    }
    for (const side of [-1, 1]) for (let z = scroll; z < 1; z += .18) { const p = perspective(z); ctx.fillStyle = side < 0 ? "#ff3d8d" : "#31e6ff"; ctx.fillRect(w / 2 + side * (p.roadHalf + 5), p.y - 8 * p.scale, 4 * p.scale, 12 * p.scale); }
  }

  function drawObject(o) {
    const p = perspective(o.z, o.lane); if (p.scale <= 0) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.scale, p.scale);
    if (o.type === "coin") {
      const bob = Math.sin(time * 7 + o.bob) * 7; ctx.translate(0, -48 + bob); ctx.rotate(Math.sin(time * 5 + o.bob) * .3);
      ctx.shadowColor = "#ffd21c"; ctx.shadowBlur = 18; ctx.fillStyle = "#ffd21c"; ctx.beginPath(); ctx.ellipse(0, 0, 12, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = "#fff1a3"; ctx.lineWidth = 3; ctx.stroke();
    } else if (o.type === "barrier") {
      ctx.translate(0, -40); ctx.fillStyle = "#ff542e"; roundedRect(-36, -35, 72, 70, 6); ctx.fill(); ctx.fillStyle = "#fff2d0";
      for (let y = -25; y < 30; y += 24) { ctx.save(); ctx.translate(0, y); ctx.rotate(-.35); ctx.fillRect(-42, -6, 84, 12); ctx.restore(); }
      ctx.fillStyle = "#172331"; ctx.fillRect(-31, 35, 8, 22); ctx.fillRect(23, 35, 8, 22);
    } else if (o.type === "sign") {
      ctx.fillStyle = "#242d3a"; ctx.fillRect(-44, -125, 9, 125); ctx.fillRect(35, -125, 9, 125); ctx.fillStyle = "#ff3d8d"; roundedRect(-65, -126, 130, 38, 5); ctx.fill(); ctx.fillStyle = "white"; ctx.font = "900 15px sans-serif"; ctx.textAlign = "center"; ctx.fillText("低头！", 0, -101);
    } else {
      ctx.translate(0, -85); const g = ctx.createLinearGradient(-45, 0, 45, 0); g.addColorStop(0, "#1c3344"); g.addColorStop(.5, "#6190a4"); g.addColorStop(1, "#172735"); ctx.fillStyle = g; roundedRect(-47, -76, 94, 162, 13); ctx.fill();
      ctx.fillStyle = "#bff7ff"; ctx.fillRect(-34, -55, 68, 38); ctx.fillStyle = "#101a23"; ctx.fillRect(-26, 2, 52, 11); ctx.fillStyle = "#ffd21c"; ctx.beginPath(); ctx.arc(-25, 64, 7, 0, 7); ctx.arc(25, 64, 7, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = perspective(0.04, player.laneVisual); const jumpY = player.jump * h * .38;
    ctx.save(); ctx.translate(p.x, p.y - 64 - jumpY); const s = Math.min(1.25, w / 900 + .55); ctx.scale(s, s);
    const lean = (player.lane - player.laneVisual) * .22; ctx.rotate(lean);
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(0, 65 + jumpY, 42 * (1 - Math.min(.65, player.jump)), 11, 0, 0, 7); ctx.fill();
    if (player.sliding > 0) {
      ctx.rotate(-.18); ctx.fillStyle = "#ff3d8d"; roundedRect(-43, -6, 82, 37, 16); ctx.fill(); ctx.fillStyle = "#f3b58d"; ctx.beginPath(); ctx.arc(34, -5, 17, 0, 7); ctx.fill(); ctx.fillStyle = "#31e6ff"; ctx.fillRect(-50, 20, 92, 13);
    } else {
      const swing = Math.sin(player.run) * 18; ctx.strokeStyle = "#122438"; ctx.lineWidth = 14; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-12, 35); ctx.lineTo(-15 + swing, 72); ctx.moveTo(12, 35); ctx.lineTo(15 - swing, 72); ctx.stroke();
      ctx.strokeStyle = "#f3b58d"; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(-20, -12); ctx.lineTo(-30 - swing * .5, 22); ctx.moveTo(20, -12); ctx.lineTo(30 + swing * .5, 22); ctx.stroke();
      ctx.fillStyle = "#ff3d8d"; roundedRect(-28, -35, 56, 75, 16); ctx.fill(); ctx.fillStyle = "#31e6ff"; ctx.fillRect(-25, 20, 50, 8);
      ctx.fillStyle = "#f3b58d"; ctx.beginPath(); ctx.arc(0, -53, 23, 0, 7); ctx.fill(); ctx.fillStyle = "#111b2b"; ctx.beginPath(); ctx.arc(-2, -60, 24, Math.PI, 6.1); ctx.lineTo(20, -42); ctx.fill();
      ctx.fillStyle = "#ffd21c"; ctx.fillRect(-13, -56, 10, 4); ctx.fillRect(7, -56, 10, 4);
    }
    ctx.restore();
  }

  function draw() {
    ctx.save(); if (shake > .1) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); drawWorld();
    objects.slice().sort((a, b) => b.z - a.z).forEach(drawObject); drawPlayer();
    particles.forEach(p => { ctx.globalAlpha = Math.max(0, p.life * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 5, 5); }); ctx.globalAlpha = 1;
    if (flash > .01) { ctx.fillStyle = `rgba(255,61,141,${flash * .45})`; ctx.fillRect(0, 0, w, h); }
    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min(.033, (now - last) / 1000 || 0); last = now; if (state === "playing") update(dt); draw(); if (state === "playing" || state === "menu" || state === "over") requestAnimationFrame(loop);
  }

  addEventListener("keydown", e => {
    if (["ArrowLeft", "a", "A"].includes(e.key)) move(-1); if (["ArrowRight", "d", "D"].includes(e.key)) move(1);
    if (["ArrowUp", "w", "W", " "].includes(e.key)) { e.preventDefault(); jump(); } if (["ArrowDown", "s", "S"].includes(e.key)) slide(); if (e.key === "Escape") togglePause();
  });
  let touchStart = null;
  canvas.addEventListener("pointerdown", e => touchStart = { x: e.clientX, y: e.clientY });
  canvas.addEventListener("pointerup", e => { if (!touchStart) return; const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y; if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 25) move(Math.sign(dx)); else if (dy < -25) jump(); else if (dy > 25) slide(); else jump(); touchStart = null; });
  document.getElementById("startBtn").onclick = start; document.getElementById("restartBtn").onclick = start; document.getElementById("pauseBtn").onclick = togglePause; document.getElementById("resumeBtn").onclick = togglePause;
  addEventListener("resize", resize); resize(); requestAnimationFrame(loop);
})();
