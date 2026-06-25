(function () {
  'use strict';

  /* ── palette ── */
  const C = {
    sand:  '#cac6be',
    peb1:  '#b6b2a8',
    peb2:  '#d4d0c6',
    peb3:  '#a6a29a',
    groove:'#9a9690',
    ridge: '#dcd8d0',

    moss1: '#2b3b1a',
    moss2: '#3a5024',
    moss3: '#4a642e',
    moss4: '#5a7a38',
    mossH: '#6a9042',
    mossE: '#7aaa4c',

    skin:  '#c8966c',
    skinD: '#b07c54',
    hat:   '#9a8060',
    hatD:  '#80643e',
    hatB:  '#504030',
    jacket:'#3a3d46',
    pants: '#bfb090',
    pantsD:'#a09070',
    shoe:  '#1e1408',
    rake:  '#8a6040',
  };

  const FS = 1.8; /* figure scale */

  /* ── state ── */
  let canvas, ctx, trailCanvas, trailCtx;
  let W, H;
  let islands = [];
  let islandUnion = null;
  let gardener = null;
  let platformRect = null;
  let headerH = 0, footerTop = 0;
  let trail = [];
  const TRAIL_MAX = 350;
  let resetTimer = 0;
  const RESET_MS = 5.5 * 60 * 1000;
  let lastTs = 0, exclAge = 0;

  /* ────────────────────────────────
     INIT
  ──────────────────────────────── */
  function init() {
    canvas = document.createElement('canvas');
    canvas.id = 'zen-bg';
    canvas.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;';
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');

    trailCanvas = document.createElement('canvas');
    trailCtx = trailCanvas.getContext('2d');

    doResize();
    window.addEventListener('resize', debounce(doResize, 200));

    gardener = new Gardener();
    requestAnimationFrame(loop);
  }

  /* ────────────────────────────────
     RESIZE
  ──────────────────────────────── */
  function doResize() {
    W = canvas.width = trailCanvas.width = window.innerWidth;
    H = canvas.height = trailCanvas.height = window.innerHeight;
    trail = [];
    updateExclusion();
    buildTrailCanvas();
    if (gardener) nudgeGardenerToSand();
  }

  function nudgeGardenerToSand() {
    let tries = 0;
    do {
      gardener.x = 80 + Math.random() * (W - 160);
      gardener.y = headerH + 70 + Math.random() * Math.max(10, footerTop - headerH - 140);
      tries++;
    } while (tries < 300 && onIsland(gardener.x, gardener.y));
  }

  /* ────────────────────────────────
     EXCLUSION RECTS
  ──────────────────────────────── */
  function updateExclusion() {
    const hdr  = document.querySelector('.site-header');
    const ftr  = document.querySelector('.site-footer');
    const plat = document.querySelector('.platform-wrap');
    headerH   = hdr  ? hdr.getBoundingClientRect().bottom  : 50;
    footerTop = ftr  ? ftr.getBoundingClientRect().top     : H - 50;
    if (plat) {
      const r = plat.getBoundingClientRect();
      platformRect = { x: r.left - 24, y: r.top - 24, w: r.width + 48, h: r.height + 48 };
    } else {
      platformRect = null;
    }
  }

  /* ────────────────────────────────
     TRAIL CANVAS  (sand + islands)
  ──────────────────────────────── */
  function buildTrailCanvas() {
    drawSandBase();
    generateIslands();
    paintIslands();
  }

  /* ── sand base ── */
  function drawSandBase() {
    trailCtx.fillStyle = C.sand;
    trailCtx.fillRect(0, 0, W, H);
    const count = Math.floor(W * H / 50);
    for (let i = 0; i < count; i++) {
      const x   = Math.random() * W;
      const y   = Math.random() * H;
      const r   = 0.4 + Math.random() * 2.0;
      const rnd = Math.random();
      trailCtx.fillStyle = rnd < 0.33 ? C.peb1 : rnd < 0.66 ? C.peb2 : C.peb3;
      trailCtx.globalAlpha = 0.22 + Math.random() * 0.32;
      trailCtx.beginPath();
      trailCtx.ellipse(x, y, r, r * (0.4 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
      trailCtx.fill();
    }
    trailCtx.globalAlpha = 1;
  }

  /* ── island generation ── */
  function generateIslands() {
    islands = [];
    islandUnion = new Path2D();

    const slots = shuffle([
      [0.05, 0.22], [0.60, 0.13], [0.82, 0.24],
      [0.07, 0.62], [0.85, 0.56], [0.17, 0.80],
      [0.64, 0.78], [0.40, 0.88], [0.48, 0.18],
      [0.92, 0.42], [0.28, 0.50], [0.72, 0.42],
    ]);

    let placed = 0;
    for (const [fx, fy] of slots) {
      if (placed >= 6) break;
      const cx = fx * W + (Math.random() - 0.5) * W * 0.04;
      const cy = fy * H + (Math.random() - 0.5) * H * 0.04;

      if (cy < headerH + 50 || cy > footerTop - 50) continue;
      if (platformRect) {
        const pr = platformRect;
        if (cx > pr.x - 70 && cx < pr.x + pr.w + 70 &&
            cy > pr.y - 70 && cy < pr.y + pr.h + 70) continue;
      }
      if (islands.some(isl =>
        Math.hypot(isl.cx - cx, isl.cy - cy) < Math.max(isl.rx, isl.ry) + 90
      )) continue;

      const rx = 55 + Math.random() * 110;
      const ry = 38 + Math.random() * 80;
      const isl = makeBlob(cx, cy, rx, ry, 10 + Math.floor(Math.random() * 7));
      islands.push(isl);
      islandUnion.addPath(isl.path2d);
      placed++;
    }
  }

  function makeBlob(cx, cy, rx, ry, npts) {
    const pts = [];
    for (let i = 0; i < npts; i++) {
      const base = (i / npts) * Math.PI * 2;
      const a = base + (Math.random() - 0.5) * (Math.PI * 2 / npts) * 0.55;
      const jitter = 0.48 + Math.random() * 1.0;
      pts.push({ x: cx + Math.cos(a) * rx * jitter, y: cy + Math.sin(a) * ry * jitter });
    }
    return { cx, cy, rx, ry, pts, path2d: blobPath(pts) };
  }

  function blobPath(pts) {
    const p = new Path2D(), n = pts.length;
    const mx = (pts[n - 1].x + pts[0].x) / 2;
    const my = (pts[n - 1].y + pts[0].y) / 2;
    p.moveTo(mx, my);
    for (let i = 0; i < n; i++) {
      const cp = pts[i], np = pts[(i + 1) % n];
      p.quadraticCurveTo(cp.x, cp.y, (cp.x + np.x) / 2, (cp.y + np.y) / 2);
    }
    p.closePath();
    return p;
  }

  /* ── paint islands onto trail canvas ── */
  function paintIslands() {
    for (const isl of islands) {
      /* drop shadow */
      trailCtx.save();
      trailCtx.shadowColor    = 'rgba(0,0,0,0.22)';
      trailCtx.shadowBlur     = 10;
      trailCtx.shadowOffsetX  = 4;
      trailCtx.shadowOffsetY  = 5;
      trailCtx.fillStyle = C.moss2;
      trailCtx.fill(isl.path2d);
      trailCtx.restore();

      /* radial gradient body */
      const g = trailCtx.createRadialGradient(
        isl.cx - isl.rx * 0.28, isl.cy - isl.ry * 0.28, 2,
        isl.cx, isl.cy, Math.max(isl.rx, isl.ry) * 1.1
      );
      g.addColorStop(0,   C.mossE);
      g.addColorStop(0.3, C.mossH);
      g.addColorStop(0.6, C.moss4);
      g.addColorStop(0.8, C.moss3);
      g.addColorStop(1,   C.moss1);
      trailCtx.fillStyle = g;
      trailCtx.fill(isl.path2d);

      /* moss texture dots — clipped */
      trailCtx.save();
      trailCtx.clip(isl.path2d);
      const dotN = Math.floor((isl.rx * isl.ry * Math.PI) / 18);
      for (let d = 0; d < dotN; d++) {
        const a  = Math.random() * Math.PI * 2;
        const dr = Math.sqrt(Math.random());
        const tx = isl.cx + Math.cos(a) * isl.rx * dr;
        const ty = isl.cy + Math.sin(a) * isl.ry * dr;
        const r  = 1.0 + Math.random() * 4.5;
        const t  = Math.random();
        trailCtx.fillStyle   = t < 0.2 ? C.mossE : t < 0.5 ? C.mossH : t < 0.75 ? C.moss2 : C.moss1;
        trailCtx.globalAlpha = 0.35 + Math.random() * 0.5;
        trailCtx.beginPath();
        trailCtx.ellipse(tx, ty, r, r * (0.3 + Math.random() * 0.7), Math.random() * Math.PI, 0, Math.PI * 2);
        trailCtx.fill();
      }
      /* grass blades at edge */
      trailCtx.globalAlpha = 0.55;
      for (let b = 0; b < 30; b++) {
        const a  = Math.random() * Math.PI * 2;
        const bx = isl.cx + Math.cos(a) * isl.rx * (0.80 + Math.random() * 0.22);
        const by = isl.cy + Math.sin(a) * isl.ry * (0.80 + Math.random() * 0.22);
        const bl = 4 + Math.random() * 10;
        trailCtx.strokeStyle = Math.random() < 0.5 ? C.mossE : C.mossH;
        trailCtx.lineWidth   = 0.8;
        trailCtx.beginPath();
        trailCtx.moveTo(bx, by);
        trailCtx.lineTo(bx + Math.cos(a) * bl, by + Math.sin(a) * bl);
        trailCtx.stroke();
      }
      trailCtx.globalAlpha = 1;
      trailCtx.restore();

      /* top-left highlight edge */
      trailCtx.strokeStyle = C.mossE;
      trailCtx.lineWidth   = 1.5;
      trailCtx.globalAlpha = 0.28;
      trailCtx.stroke(isl.path2d);
      trailCtx.globalAlpha = 1;
    }
  }

  /* ────────────────────────────────
     GARDENER
  ──────────────────────────────── */
  function Gardener() {
    this.angle    = Math.random() * Math.PI * 2;
    this.angleVel = 0;
    this.speed    = 1.3;
    this.frame    = 0;
    this.tick     = 0;
    this.facing   = 1;
    let t = 0;
    do {
      this.x = 90 + Math.random() * (W - 180);
      this.y = headerH + 70 + Math.random() * Math.max(10, footerTop - headerH - 140);
      t++;
    } while (t < 400 && onIsland(this.x, this.y));
  }

  Gardener.prototype.update = function () {
    this.angleVel += (Math.random() - 0.5) * 0.044;
    this.angleVel *= 0.91;
    this.angle += this.angleVel;

    const M  = 30;
    let nx = this.x + Math.cos(this.angle) * this.speed;
    let ny = this.y + Math.sin(this.angle) * this.speed;
    let hit = false;

    if (nx < M)             { nx = M;             this.angle = Math.PI - this.angle; this.angleVel *= -0.5; hit = true; }
    if (nx > W - M)         { nx = W - M;         this.angle = Math.PI - this.angle; this.angleVel *= -0.5; hit = true; }
    if (ny < headerH + M)   { ny = headerH + M;   this.angle = -this.angle;          this.angleVel *= -0.5; hit = true; }
    if (ny > footerTop - M) { ny = footerTop - M; this.angle = -this.angle;          this.angleVel *= -0.5; hit = true; }

    if (!hit && platformRect) {
      const pr = platformRect;
      if (nx > pr.x && nx < pr.x + pr.w && ny > pr.y && ny < pr.y + pr.h) {
        const away = Math.atan2(this.y - (pr.y + pr.h / 2), this.x - (pr.x + pr.w / 2));
        this.angle    = away + (Math.random() - 0.5) * 0.7;
        this.angleVel = 0;
        hit = true;
      }
    }

    if (!hit && onIsland(nx, ny)) {
      const near = nearestIsland(this.x, this.y);
      if (near) {
        this.angle = Math.atan2(this.y - near.cy, this.x - near.cx) + (Math.random() - 0.5) * 1.1;
      } else {
        this.angle += Math.PI + (Math.random() - 0.5) * 0.6;
      }
      this.angleVel *= -0.3;
      hit = true;
    }

    if (!hit) {
      this.x = nx;
      this.y = ny;
      trail.push({ x: nx, y: ny });
      if (trail.length > TRAIL_MAX) trail.shift();
      drawTrailSegment();
    }

    this.facing = Math.cos(this.angle) >= 0 ? 1 : -1;
    this.tick++;
    if (this.tick % 18 === 0) this.frame = 1 - this.frame;
  };

  Gardener.prototype.draw = function () {
    drawFigure(ctx, this.x, this.y, this.facing, this.frame);
  };

  function onIsland(x, y) {
    return islandUnion ? ctx.isPointInPath(islandUnion, x, y) : false;
  }

  function nearestIsland(x, y) {
    let best = null, bd = Infinity;
    for (const isl of islands) {
      const d = (isl.cx - x) ** 2 + (isl.cy - y) ** 2;
      if (d < bd) { bd = d; best = isl; }
    }
    return best;
  }

  /* ────────────────────────────────
     RAKE TRAIL
  ──────────────────────────────── */
  function drawTrailSegment() {
    const n = trail.length;
    if (n < 4) return;

    const TINES   = 5;
    const SPACING = 4.5;
    const pA = trail[Math.max(0, n - 5)];
    const pM = trail[Math.max(0, n - 3)];
    const pB = trail[n - 1];

    const dx = pB.x - pA.x, dy = pB.y - pA.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len, py = dx / len;

    trailCtx.save();
    trailCtx.lineCap  = 'round';
    trailCtx.lineWidth = 1.1;

    for (let t = 0; t < TINES; t++) {
      const off = (t - (TINES - 1) / 2) * SPACING;
      const ox  = px * off, oy = py * off;
      trailCtx.strokeStyle = t % 2 === 0 ? C.groove : C.ridge;
      trailCtx.globalAlpha = 0.6;
      trailCtx.beginPath();
      trailCtx.moveTo(pA.x + ox, pA.y + oy);
      trailCtx.quadraticCurveTo(pM.x + ox, pM.y + oy, pB.x + ox, pB.y + oy);
      trailCtx.stroke();
    }
    trailCtx.globalAlpha = 1;
    trailCtx.restore();
  }

  /* ────────────────────────────────
     GARDENER FIGURE
  ──────────────────────────────── */
  function drawFigure(c, x, y, dir, frame) {
    c.save();
    c.translate(x, y);
    c.scale(FS, FS);

    const lSwing = frame === 0 ? 3.5 : -3.5;

    /* ground shadow */
    c.fillStyle = 'rgba(0,0,0,0.13)';
    c.beginPath();
    c.ellipse(0, 14, 10, 3.5, 0, 0, Math.PI * 2);
    c.fill();

    /* legs */
    c.lineCap = 'round';
    c.strokeStyle = '#a09070';
    c.lineWidth   = 3.8;
    c.beginPath(); c.moveTo(-1.5 * dir, 4); c.lineTo((-2 + lSwing) * dir, 13); c.stroke();
    c.strokeStyle = '#bfb090';
    c.beginPath(); c.moveTo( 1.5 * dir, 4); c.lineTo(( 2 - lSwing) * dir, 13); c.stroke();

    /* shoes */
    c.fillStyle = C.shoe;
    c.beginPath(); c.ellipse((-2 + lSwing) * dir, 13.5, 4, 2, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(( 2 - lSwing) * dir, 13.5, 4, 2, 0, 0, Math.PI * 2); c.fill();

    /* body (slightly forward-leaning) */
    c.save();
    c.rotate(dir * 0.08);
    c.fillStyle = C.jacket;
    c.beginPath();
    c.moveTo(-5.5, -4.5);
    c.bezierCurveTo(-6, 0, -6.5, 4, -6, 6.5);
    c.lineTo(6, 6.5);
    c.bezierCurveTo(6.5, 4, 6, 0, 5.5, -4.5);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.07)';
    c.fillRect(-5, -4, 2.5, 10);
    c.restore();

    /* arms */
    c.strokeStyle = C.jacket;
    c.lineWidth   = 4.5;
    c.lineCap     = 'round';
    c.beginPath(); c.moveTo( 4.5 * dir, -1.5); c.quadraticCurveTo( 7 * dir, 2, 11 * dir, 7); c.stroke();
    c.beginPath(); c.moveTo(-4.5 * dir, -1.5); c.quadraticCurveTo(-7 * dir, 1, -8 * dir, 5); c.stroke();

    /* rake handle */
    c.strokeStyle = C.rake;
    c.lineWidth   = 1.8;
    c.beginPath();
    c.moveTo(11 * dir, 7);
    c.lineTo(11 * dir + 15 * dir, 17);
    c.stroke();
    /* crossbar */
    const rx1 = 11 * dir + 15 * dir, ry1 = 17;
    c.strokeStyle = '#555';
    c.lineWidth   = 1.4;
    c.beginPath(); c.moveTo(rx1 - 5, ry1); c.lineTo(rx1 + 5, ry1); c.stroke();
    /* tines */
    c.lineWidth = 0.9;
    for (let t = -4; t <= 4; t += 2) {
      c.beginPath();
      c.moveTo(rx1 + t * 0.6,           ry1);
      c.lineTo(rx1 + t * 0.6 + dir * 4, ry1 + 5);
      c.stroke();
    }

    /* head */
    c.fillStyle = C.skin;
    c.beginPath();
    c.ellipse(-0.5 * dir, -10, 5.5, 6.5, dir * 0.1, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = C.skinD;
    c.beginPath();
    c.ellipse(-4.5 * dir, -9.5, 1.8, 2.6, 0, 0, Math.PI * 2);
    c.fill();

    /* bucket hat brim */
    c.fillStyle = C.hat;
    c.beginPath();
    c.ellipse(0.5 * dir, -15, 9.5, 3, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.15)';
    c.beginPath();
    c.ellipse(0.5 * dir, -14, 9.5, 3, 0, 0, Math.PI);
    c.fill();
    /* crown */
    c.fillStyle = C.hatD;
    c.beginPath();
    c.moveTo(-6, -15);
    c.bezierCurveTo(-6.5, -19, -5.5, -24, -5, -25);
    c.lineTo(6, -25);
    c.bezierCurveTo(6.5, -24, 6.5, -19, 6, -15);
    c.closePath();
    c.fill();
    /* band */
    c.fillStyle = C.hatB;
    c.fillRect(-6, -17, 12.5, 2.5);
    /* highlight */
    c.fillStyle = 'rgba(255,255,255,0.10)';
    c.fillRect(-4, -24, 2.5, 8);

    c.restore();
  }

  /* ────────────────────────────────
     FOG
  ──────────────────────────────── */
  function drawFog() {
    const fh = H * 0.30;
    const g  = ctx.createLinearGradient(0, 0, 0, fh);
    g.addColorStop(0, 'rgba(196,204,212,0.28)');
    g.addColorStop(1, 'rgba(196,204,212,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, fh);
  }

  /* ────────────────────────────────
     RENDER
  ──────────────────────────────── */
  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(trailCanvas, 0, 0);
    gardener.draw();
    drawFog();
  }

  /* ────────────────────────────────
     RESET
  ──────────────────────────────── */
  function doReset() {
    trail = [];
    let alpha = 0;
    function step() {
      alpha = Math.min(1, alpha + 0.013);
      trailCtx.fillStyle = `rgba(202,198,190,${alpha})`;
      trailCtx.fillRect(0, 0, W, H);
      if (alpha < 1) requestAnimationFrame(step);
      else { drawSandBase(); generateIslands(); paintIslands(); }
    }
    requestAnimationFrame(step);
  }

  /* ────────────────────────────────
     LOOP
  ──────────────────────────────── */
  function loop(ts) {
    const dt = Math.min(ts - lastTs, 50);
    lastTs = ts;
    resetTimer += dt;
    exclAge    += dt;
    if (exclAge    > 600)      { updateExclusion(); exclAge = 0; }
    if (resetTimer > RESET_MS) { resetTimer = 0; doReset(); }
    gardener.update();
    render();
    requestAnimationFrame(loop);
  }

  /* ────────────────────────────────
     UTILS
  ──────────────────────────────── */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function debounce(fn, ms) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
