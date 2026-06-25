(function () {
  'use strict';

  /* ── scene constants (all relative; recomputed on resize) ── */
  let W, H;
  let SCENE_Y;   // top of the coastal scene (upper portion is plain white)
  let CLIFF_X;   // x where cliff base meets the beach
  let BEACH_Y;   // y of cliff base / top of beach strip

  /* ── canvas state ── */
  let canvas, ctx, staticCanvas, staticCtx;
  let cliffPts = [];   // pre-computed cliff face control points
  let time = 0, lastTs = 0;

  const INK = '#1a1a1a';

  /* ────────────────────────────────
     INIT
  ──────────────────────────────── */
  function init() {
    canvas = document.createElement('canvas');
    canvas.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');

    staticCanvas = document.createElement('canvas');
    staticCtx = staticCanvas.getContext('2d');

    resize();
    window.addEventListener('resize', debounce(resize, 200));
    requestAnimationFrame(loop);
  }

  /* ────────────────────────────────
     RESIZE
  ──────────────────────────────── */
  function resize() {
    W = canvas.width  = staticCanvas.width  = window.innerWidth;
    H = canvas.height = staticCanvas.height = window.innerHeight;

    SCENE_Y = H * 0.54;
    CLIFF_X = W * 0.66;
    BEACH_Y = H * 0.80;

    computeCliffPoints();
    buildStatic();
  }

  /* ── cliff face control points (fixed, no randomness) ── */
  function computeCliffPoints() {
    const sy = SCENE_Y;
    cliffPts = [
      { x: W * 0.880, y: sy + H * 0.010 },
      { x: W * 0.848, y: sy + H * 0.030 },
      { x: W * 0.865, y: sy + H * 0.055 },
      { x: W * 0.830, y: sy + H * 0.078 },
      { x: W * 0.810, y: sy + H * 0.100 },
      { x: W * 0.838, y: sy + H * 0.126 },
      { x: W * 0.800, y: sy + H * 0.150 },
      { x: W * 0.775, y: sy + H * 0.172 },
      { x: W * 0.745, y: sy + H * 0.196 },
      { x: W * 0.718, y: sy + H * 0.216 },
      { x: CLIFF_X,   y: BEACH_Y        },
    ];
  }

  /* ────────────────────────────────
     STATIC LAYER
  ──────────────────────────────── */
  function buildStatic() {
    const c = staticCtx;
    c.clearRect(0, 0, W, H);

    /* white base */
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);

    drawHorizonHaze(c);
    drawDistantHeadlands(c);
    drawCliff(c);
    drawBeach(c);
    drawRocks(c);
  }

  /* ── horizon haze ── */
  function drawHorizonHaze(c) {
    /* very faint horizontal strokes at scene top */
    c.save();
    c.strokeStyle = 'rgba(80,80,80,0.07)';
    c.lineWidth = 0.6;
    for (let i = 0; i < 14; i++) {
      const y = SCENE_Y - 8 + i * 3.5;
      const xEnd = W * (0.72 - i * 0.02);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(xEnd, y);
      c.stroke();
    }
    /* soft gradient mask at horizon line */
    const g = c.createLinearGradient(0, SCENE_Y - 24, 0, SCENE_Y + 28);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(248,249,250,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, SCENE_Y - 24, W, 52);
    c.restore();
  }

  /* ── distant headlands (2 soft humps in background) ── */
  function drawDistantHeadlands(c) {
    c.save();
    c.globalAlpha = 0.11;

    /* headland A — far left */
    c.beginPath();
    c.moveTo(W * 0.02, SCENE_Y + H * 0.04);
    c.bezierCurveTo(W * 0.06, SCENE_Y, W * 0.11, SCENE_Y - H * 0.01, W * 0.16, SCENE_Y + H * 0.012);
    c.bezierCurveTo(W * 0.19, SCENE_Y + H * 0.004, W * 0.22, SCENE_Y + H * 0.006, W * 0.25, SCENE_Y + H * 0.04);
    c.lineTo(W * 0.25, SCENE_Y + H * 0.08);
    c.lineTo(W * 0.02, SCENE_Y + H * 0.08);
    c.closePath();
    c.fillStyle = '#555';
    c.fill();
    c.strokeStyle = '#444';
    c.lineWidth = 0.8;
    c.stroke();

    /* headland B — center-left */
    c.beginPath();
    c.moveTo(W * 0.27, SCENE_Y + H * 0.052);
    c.bezierCurveTo(W * 0.31, SCENE_Y + H * 0.01, W * 0.36, SCENE_Y + H * 0.006, W * 0.41, SCENE_Y + H * 0.016);
    c.bezierCurveTo(W * 0.44, SCENE_Y + H * 0.01, W * 0.47, SCENE_Y + H * 0.014, W * 0.50, SCENE_Y + H * 0.050);
    c.lineTo(W * 0.50, SCENE_Y + H * 0.092);
    c.lineTo(W * 0.27, SCENE_Y + H * 0.092);
    c.closePath();
    c.fill();
    c.stroke();

    c.restore();
  }

  /* ── main cliff ── */
  function drawCliff(c) {
    c.save();

    /* filled region */
    c.beginPath();
    buildCliffRegion(c);
    c.fillStyle = '#eeeeee';
    c.fill();

    /* hatching clipped to cliff region */
    c.beginPath();
    buildCliffRegion(c);
    c.clip();
    c.strokeStyle = 'rgba(26,26,26,0.09)';
    c.lineWidth = 0.65;
    const spacing = 10;
    for (let d = -H; d < W + H; d += spacing) {
      c.beginPath();
      c.moveTo(d, 0);
      c.lineTo(d + H, H);
      c.stroke();
    }
    c.restore();

    /* cliff face outline on top */
    c.save();
    c.beginPath();
    c.moveTo(cliffPts[0].x, cliffPts[0].y);
    for (let i = 1; i < cliffPts.length; i++) {
      const p = cliffPts[i - 1], q = cliffPts[i];
      c.quadraticCurveTo(
        p.x * 0.35 + q.x * 0.65,
        p.y * 0.35 + q.y * 0.65,
        q.x, q.y
      );
    }
    c.strokeStyle = INK;
    c.lineWidth   = 1.5;
    c.lineCap     = 'round';
    c.lineJoin    = 'round';
    c.stroke();
    c.restore();
  }

  function buildCliffRegion(c) {
    c.moveTo(W, 0);
    c.lineTo(W, H);
    c.lineTo(CLIFF_X, H);
    c.lineTo(CLIFF_X, BEACH_Y);
    for (let i = cliffPts.length - 1; i >= 0; i--) {
      c.lineTo(cliffPts[i].x, cliffPts[i].y);
    }
    c.closePath();
  }

  /* ── beach strip ── */
  function drawBeach(c) {
    c.save();
    c.beginPath();

    /* top (waterline) edge — gentle curve left to right, rising to cliff base */
    c.moveTo(0, BEACH_Y + H * 0.004);
    c.bezierCurveTo(
      W * 0.22, BEACH_Y - H * 0.006,
      W * 0.46, BEACH_Y - H * 0.010,
      CLIFF_X,  BEACH_Y
    );
    /* right edge down cliff base */
    c.lineTo(CLIFF_X, BEACH_Y + H * 0.065);
    /* bottom edge back to left */
    c.bezierCurveTo(
      W * 0.46, BEACH_Y + H * 0.072,
      W * 0.22, BEACH_Y + H * 0.075,
      0, BEACH_Y + H * 0.070
    );
    c.closePath();

    c.fillStyle   = '#f8f6f0';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth   = 0.9;
    c.stroke();

    /* wet-sand texture: faint elliptical tide marks inside beach */
    c.clip();
    c.strokeStyle = 'rgba(26,26,26,0.055)';
    c.lineWidth   = 0.5;
    for (let i = 0; i < 7; i++) {
      const bx = W * (0.08 + i * 0.08);
      const by = BEACH_Y + H * 0.025 + Math.sin(i * 1.3) * H * 0.012;
      c.beginPath();
      c.ellipse(bx, by, 18 + i * 4, 3.5, -0.08, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }

  /* ── rock outcroppings ── */
  function drawRocks(c) {
    const rocks = [
      { pts: [ [0.13, 0.01], [0.16, -0.01], [0.19, 0.005], [0.18, 0.022], [0.14, 0.024] ], cx: W*0.155, cy: BEACH_Y - H*0.04 },
      { pts: [ [0.27, 0.005],[0.30, -0.008],[0.32, 0.006], [0.31, 0.020], [0.28, 0.022] ], cx: W*0.295, cy: BEACH_Y - H*0.04 },
      { pts: [ [0.40, 0.008],[0.42, -0.004],[0.44, 0.008], [0.43, 0.018], [0.41, 0.020] ], cx: W*0.42,  cy: BEACH_Y - H*0.03 },
      { pts: [ [0.06, 0.015],[0.08, 0.002], [0.10, 0.014], [0.09, 0.026], [0.07, 0.026] ], cx: W*0.08,  cy: BEACH_Y - H*0.025 },
    ];

    for (const rock of rocks) {
      c.save();
      c.beginPath();
      const first = rock.pts[0];
      c.moveTo(W * first[0], BEACH_Y + H * first[1]);
      for (let i = 1; i < rock.pts.length; i++) {
        const pt = rock.pts[i];
        c.lineTo(W * pt[0], BEACH_Y + H * pt[1]);
      }
      c.closePath();
      c.fillStyle   = '#e6e6e6';
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth   = 0.85;
      c.stroke();
      c.restore();
    }
  }

  /* ────────────────────────────────
     ANIMATED WAVES
  ──────────────────────────────── */
  const WAVE_DEFS = [
    { yFrac: 0.570, amp: 4.0, speed: 0.28, λFrac: 0.58, lw: 0.75, foam: false },
    { yFrac: 0.624, amp: 5.0, speed: 0.32, λFrac: 0.54, lw: 0.85, foam: false },
    { yFrac: 0.678, amp: 6.5, speed: 0.36, λFrac: 0.50, lw: 0.95, foam: false },
    { yFrac: 0.732, amp: 8.0, speed: 0.40, λFrac: 0.46, lw: 1.05, foam: true  },
    { yFrac: 0.786, amp: 9.5, speed: 0.45, λFrac: 0.42, lw: 1.15, foam: true  },
  ];

  function drawWaves(c, t) {
    c.save();
    c.lineCap  = 'round';
    c.lineJoin = 'round';

    for (let wi = 0; wi < WAVE_DEFS.length; wi++) {
      const def  = WAVE_DEFS[wi];
      const yBase = H * def.yFrac;
      const λ     = W * def.λFrac;
      const phase = wi * Math.PI / 2.5;
      const endX  = CLIFF_X - wi * 18;
      const step  = 3;

      /* sample wave y-values */
      const pts = [];
      for (let x = 0; x <= endX; x += step) {
        pts.push({ x, y: yBase + def.amp * Math.sin(2 * Math.PI * x / λ + t * def.speed + phase) });
      }
      if (!pts.length) continue;

      /* white fill below wave (layering) */
      c.beginPath();
      c.moveTo(0, H);
      c.lineTo(pts[0].x, pts[0].y);
      for (const p of pts) c.lineTo(p.x, p.y);
      c.lineTo(endX, H);
      c.closePath();
      c.fillStyle = 'rgba(255,255,255,0.90)';
      c.fill();

      /* wave line */
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        c.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      c.strokeStyle = INK;
      c.lineWidth   = def.lw;
      c.stroke();

      /* foam curls on the two foreground waves */
      if (def.foam) drawFoamCurls(c, pts, wi, t);
    }

    c.restore();
  }

  function drawFoamCurls(c, pts, wi, t) {
    const curlPositions = [0.12, 0.28, 0.45, 0.62, 0.78];
    c.save();
    c.strokeStyle = `rgba(26,26,26,0.32)`;
    c.lineWidth   = 0.65;
    c.lineCap     = 'round';

    for (const frac of curlPositions) {
      const xi = Math.floor(frac * (pts.length - 4));
      if (xi < 0 || xi >= pts.length) continue;
      /* small offset that shifts slowly with time so curls breathe */
      const yOff = Math.sin(t * 0.6 + wi + frac * 5) * 1.2;
      const pt   = pts[xi];
      const w2   = 5 + (frac * 3) | 0;
      c.beginPath();
      c.moveTo(pt.x - w2, pt.y + yOff);
      c.quadraticCurveTo(pt.x, pt.y - 2.5 + yOff, pt.x + w2, pt.y + yOff);
      c.stroke();
    }
    c.restore();
  }

  /* ────────────────────────────────
     RENDER LOOP
  ──────────────────────────────── */
  function loop(ts) {
    const dt = Math.min(ts - lastTs, 50);
    lastTs = ts;
    time  += dt * 0.001;

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(staticCanvas, 0, 0);
    drawWaves(ctx, time);

    requestAnimationFrame(loop);
  }

  /* ────────────────────────────────
     UTILS
  ──────────────────────────────── */
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
