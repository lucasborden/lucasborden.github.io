(function () {
  'use strict';

  const INK    = '#1a1a1a';
  const SEA_SC = 3; // render sea at 1/3 res, upscale 3x

  let canvas, ctx, staticCanvas, staticCtx, seaCanvas, seaCtx, seaImgData;
  let W, H, SEA_Y, BEACH_Y, CLIFF_X, seaW, seaH;
  let cliffPts = [];
  let time = 0, lastTs = 0;

  /* ─── init ─────────────────────────────────────────────────────────────── */
  function init() {
    canvas = document.createElement('canvas');
    canvas.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');

    staticCanvas = document.createElement('canvas');
    staticCtx    = staticCanvas.getContext('2d');

    seaCanvas = document.createElement('canvas');
    seaCtx    = seaCanvas.getContext('2d');

    resize();
    window.addEventListener('resize', debounce(resize, 200));
    requestAnimationFrame(loop);
  }

  /* ─── resize ────────────────────────────────────────────────────────────── */
  function resize() {
    W = canvas.width = staticCanvas.width = window.innerWidth;
    H = canvas.height = staticCanvas.height = window.innerHeight;

    SEA_Y   = H * 0.53;
    BEACH_Y = H * 0.84;
    CLIFF_X = W * 0.65;

    seaW = Math.ceil(W    / SEA_SC);
    seaH = Math.ceil((BEACH_Y - SEA_Y) / SEA_SC) + 1;
    seaCanvas.width  = seaW;
    seaCanvas.height = seaH;
    seaImgData = seaCtx.createImageData(seaW, seaH);

    computeCliffPts();
    buildStatic();
  }

  /* ─── cliff control points ──────────────────────────────────────────────── */
  function computeCliffPts() {
    const sh = BEACH_Y - SEA_Y;
    cliffPts = [
      { x: W * 0.884, y: SEA_Y + sh * 0.000 },
      { x: W * 0.856, y: SEA_Y + sh * 0.052 },
      { x: W * 0.874, y: SEA_Y + sh * 0.108 },
      { x: W * 0.842, y: SEA_Y + sh * 0.162 },
      { x: W * 0.827, y: SEA_Y + sh * 0.218 },
      { x: W * 0.854, y: SEA_Y + sh * 0.276 },
      { x: W * 0.833, y: SEA_Y + sh * 0.336 },
      { x: W * 0.809, y: SEA_Y + sh * 0.398 },
      { x: W * 0.840, y: SEA_Y + sh * 0.458 },
      { x: W * 0.816, y: SEA_Y + sh * 0.518 },
      { x: W * 0.793, y: SEA_Y + sh * 0.576 },
      { x: W * 0.774, y: SEA_Y + sh * 0.636 },
      { x: W * 0.752, y: SEA_Y + sh * 0.696 },
      { x: W * 0.734, y: SEA_Y + sh * 0.758 },
      { x: W * 0.712, y: SEA_Y + sh * 0.822 },
      { x: W * 0.693, y: SEA_Y + sh * 0.888 },
      { x: CLIFF_X,   y: BEACH_Y            },
    ];
  }

  /* ─── static layer (cliff, beach, rocks, atmosphere) ───────────────────── */
  function buildStatic() {
    const c  = staticCtx;
    const sh = BEACH_Y - SEA_Y;
    c.clearRect(0, 0, W, H);

    /* white above scene (covers sea canvas in content area) */
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, SEA_Y + 8);

    /* horizon haze — fades from white into sea zone */
    const hazeG = c.createLinearGradient(0, SEA_Y - 8, 0, SEA_Y + 60);
    hazeG.addColorStop(0,    'rgba(255,255,255,1)');
    hazeG.addColorStop(0.40, 'rgba(248,250,252,0.60)');
    hazeG.addColorStop(1,    'rgba(255,255,255,0)');
    c.fillStyle = hazeG;
    c.fillRect(0, SEA_Y - 8, W * 0.70, 68);

    /* faint horizon strokes */
    c.save();
    c.strokeStyle = 'rgba(40,40,40,0.048)';
    c.lineWidth   = 0.55;
    for (let i = 0; i < 22; i++) {
      const y  = SEA_Y - 6 + i * 3.1;
      const xe = W * (0.73 - i * 0.013);
      if (xe < 0) break;
      c.beginPath(); c.moveTo(0, y); c.lineTo(xe, y); c.stroke();
    }
    c.restore();

    /* distant headlands */
    drawHeadlands(c, sh);

    /* cliff */
    drawCliff(c, sh);

    /* beach */
    drawBeach(c, sh);

    /* rocks */
    drawRocks(c, sh);
  }

  function drawHeadlands(c, sh) {
    c.save();
    const defs = [
      { a: 0.09, pts: [[0.02,0.04],[0.07,-0.01],[0.13,-0.02],[0.18,0.01],[0.22,0.05],[0.22,0.11],[0.02,0.11]] },
      { a: 0.11, pts: [[0.25,0.03],[0.31,-0.02],[0.37,-0.03],[0.42,0.00],[0.48,0.04],[0.48,0.12],[0.25,0.12]] },
    ];
    for (const def of defs) {
      c.globalAlpha = def.a;
      c.fillStyle   = '#222';
      c.strokeStyle = '#111';
      c.lineWidth   = 0.75;
      c.beginPath();
      const pts = def.pts;
      c.moveTo(W * pts[0][0], SEA_Y + sh * pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i], n = pts[i + 1];
        c.quadraticCurveTo(
          W * p[0], SEA_Y + sh * p[1],
          W * (p[0] + n[0]) / 2, SEA_Y + sh * (p[1] + n[1]) / 2
        );
      }
      const L = pts[pts.length - 1];
      c.lineTo(W * L[0], SEA_Y + sh * L[1]);
      c.closePath();
      c.fill(); c.stroke();
    }
    c.restore();
  }

  function drawCliff(c, sh) {
    /* 1. fill + clip for all texture work */
    c.save();
    c.beginPath(); buildCliffPath(c);
    c.fillStyle = '#dcdcdc';
    c.fill();
    c.clip();

    /* tonal gradient */
    const tg = c.createLinearGradient(W * 0.63, SEA_Y, W, BEACH_Y);
    tg.addColorStop(0,    'rgba(255,255,255,0.30)');
    tg.addColorStop(0.35, 'rgba(160,160,160,0.06)');
    tg.addColorStop(0.70, 'rgba(60,60,60,0.14)');
    tg.addColorStop(1,    'rgba(30,30,30,0.26)');
    c.fillStyle = tg;
    c.fillRect(W * 0.60, SEA_Y - 5, W * 0.45, sh + 10);

    /* rock strata (horizontal bands) */
    for (let s = 0; s < 32; s++) {
      const yf  = (s + 0.5) / 32;
      const y   = SEA_Y + yf * sh;
      const d   = 0.035 + Math.abs(Math.sin(s * 1.83 + 0.4)) * 0.095;
      const thk = 1.0   + Math.abs(Math.sin(s * 2.51)) * 2.8;
      c.fillStyle = `rgba(25,25,25,${d.toFixed(3)})`;
      c.fillRect(W * 0.60, y, W * 0.43, thk);
    }

    /* fine diagonal hatching */
    c.strokeStyle = 'rgba(26,26,26,0.065)';
    c.lineWidth   = 0.5;
    for (let d = -sh; d < W * 0.45 + sh; d += 8) {
      c.beginPath();
      c.moveTo(W * 0.60 + d, SEA_Y);
      c.lineTo(W * 0.60 + d + sh, SEA_Y + sh);
      c.stroke();
    }

    /* denser shadow hatching in lower cliff */
    c.strokeStyle = 'rgba(26,26,26,0.105)';
    c.lineWidth   = 0.4;
    for (let d = -sh * 0.5; d < W * 0.38 + sh * 0.5; d += 5.5) {
      c.beginPath();
      c.moveTo(W * 0.74 + d, SEA_Y + sh * 0.52);
      c.lineTo(W * 0.74 + d + sh * 0.54, SEA_Y + sh);
      c.stroke();
    }

    /* vertical fissures */
    c.strokeStyle = 'rgba(18,18,18,0.30)';
    c.lineWidth   = 0.8;
    c.lineCap     = 'round';
    const fiss = [
      [W*0.847, SEA_Y+sh*0.00, W*0.841, SEA_Y+sh*0.15, W*0.849, SEA_Y+sh*0.34, W*0.844, SEA_Y+sh*0.57],
      [W*0.813, SEA_Y+sh*0.17, W*0.807, SEA_Y+sh*0.38, W*0.814, SEA_Y+sh*0.63],
      [W*0.863, SEA_Y+sh*0.05, W*0.858, SEA_Y+sh*0.23, W*0.866, SEA_Y+sh*0.50, W*0.861, SEA_Y+sh*0.76],
      [W*0.779, SEA_Y+sh*0.33, W*0.773, SEA_Y+sh*0.56, W*0.780, SEA_Y+sh*0.82],
      [W*0.827, SEA_Y+sh*0.40, W*0.820, SEA_Y+sh*0.65, W*0.828, SEA_Y+sh*0.90],
      [W*0.795, SEA_Y+sh*0.52, W*0.789, SEA_Y+sh*0.72],
      [W*0.834, SEA_Y+sh*0.08, W*0.828, SEA_Y+sh*0.28],
    ];
    for (const f of fiss) {
      c.beginPath();
      for (let i = 0; i < f.length; i += 2) {
        i === 0 ? c.moveTo(f[0], f[1]) : c.lineTo(f[i], f[i + 1]);
      }
      c.stroke();
    }

    /* sunlit highlight band (upper left of cliff face) */
    const hl = c.createLinearGradient(W * 0.63, SEA_Y, W * 0.78, SEA_Y + sh * 0.45);
    hl.addColorStop(0, 'rgba(255,255,255,0.22)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hl;
    c.fillRect(W * 0.60, SEA_Y, W * 0.22, sh * 0.50);

    c.restore();

    /* cliff face outline — drawn outside clip */
    c.save();
    c.beginPath();
    c.moveTo(cliffPts[0].x, cliffPts[0].y);
    for (let i = 1; i < cliffPts.length; i++) {
      const p = cliffPts[i - 1], q = cliffPts[i];
      c.quadraticCurveTo(
        p.x * 0.40 + q.x * 0.60,
        p.y * 0.40 + q.y * 0.60,
        q.x, q.y
      );
    }
    c.strokeStyle = INK;
    c.lineWidth   = 1.85;
    c.lineCap = c.lineJoin = 'round';
    c.stroke();
    c.restore();

    /* scrub vegetation along clifftop */
    c.save();
    c.fillStyle   = '#c4c4c4';
    c.strokeStyle = 'rgba(26,26,26,0.38)';
    c.lineWidth   = 0.6;
    [[0.882,0.000,4.2],[0.857,-0.012,3.1],[0.871,-0.006,5.0],[0.847,-0.014,3.8],[0.893,-0.009,2.9],[0.866,0.005,3.4]].forEach(([xf, yf, r]) => {
      c.beginPath();
      c.ellipse(W * xf, SEA_Y + sh * yf, r * 1.7, r * 0.75, 0, 0, Math.PI * 2);
      c.fill(); c.stroke();
    });
    c.restore();
  }

  function buildCliffPath(c) {
    c.moveTo(W, SEA_Y);
    c.lineTo(W, H);
    c.lineTo(CLIFF_X, H);
    c.lineTo(CLIFF_X, BEACH_Y);
    for (let i = cliffPts.length - 1; i >= 0; i--) c.lineTo(cliffPts[i].x, cliffPts[i].y);
    c.closePath();
  }

  function drawBeach(c, sh) {
    c.save();
    c.beginPath();
    c.moveTo(0, BEACH_Y + sh * 0.010);
    c.bezierCurveTo(W * 0.22, BEACH_Y - sh * 0.006, W * 0.46, BEACH_Y - sh * 0.011, CLIFF_X, BEACH_Y);
    c.lineTo(CLIFF_X, BEACH_Y + sh * 0.125);
    c.bezierCurveTo(W * 0.46, BEACH_Y + sh * 0.135, W * 0.22, BEACH_Y + sh * 0.140, 0, BEACH_Y + sh * 0.132);
    c.closePath();

    const sg = c.createLinearGradient(0, BEACH_Y, 0, BEACH_Y + sh * 0.135);
    sg.addColorStop(0,    '#d6d2c8');
    sg.addColorStop(0.35, '#e8e4da');
    sg.addColorStop(1,    '#f2efe6');
    c.fillStyle   = sg;
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth   = 0.95;
    c.stroke();

    /* tide marks */
    c.clip();
    c.strokeStyle = 'rgba(26,26,26,0.052)';
    c.lineWidth   = 0.55;
    for (let i = 0; i < 13; i++) {
      const ty = BEACH_Y + sh * 0.016 + i * sh * 0.0095;
      c.beginPath();
      c.moveTo(W * 0.01 + i * W * 0.007, ty);
      c.bezierCurveTo(W * 0.25, ty - sh * 0.006, W * 0.46, ty - sh * 0.010, CLIFF_X - W * 0.025, ty - sh * 0.002);
      c.stroke();
    }
    c.restore();
  }

  function drawRocks(c, sh) {
    /* polygons: [xFrac, yDelta_rel_beach] where negative = above beach line */
    const defs = [
      { v:[[0.085,-0.032],[0.110,-0.052],[0.145,-0.038],[0.150,-0.018],[0.120,-0.010],[0.090,-0.013]], g: 88  },
      { v:[[0.205,-0.022],[0.235,-0.040],[0.265,-0.028],[0.270,-0.011],[0.230,-0.006]],               g: 102 },
      { v:[[0.330,-0.026],[0.360,-0.042],[0.395,-0.030],[0.400,-0.013],[0.360,-0.008],[0.335,-0.011]],g: 94  },
      { v:[[0.450,-0.019],[0.472,-0.032],[0.502,-0.022],[0.508,-0.009],[0.474,-0.005]],               g: 108 },
      { v:[[0.045,-0.020],[0.065,-0.034],[0.082,-0.025],[0.082,-0.009],[0.052,-0.006]],               g: 78  },
      { v:[[0.545,-0.014],[0.562,-0.025],[0.582,-0.017],[0.584,-0.007],[0.550,-0.004]],               g: 112 },
      { v:[[0.162,-0.011],[0.180,-0.020],[0.198,-0.014],[0.198,-0.005],[0.165,-0.003]],               g: 118 },
      { v:[[0.290,-0.016],[0.308,-0.027],[0.325,-0.019],[0.326,-0.007],[0.293,-0.004]],               g: 96  },
    ];
    for (const def of defs) {
      c.save();
      c.beginPath();
      const v0 = def.v[0];
      c.moveTo(W * v0[0], BEACH_Y + sh * v0[1]);
      for (let i = 1; i < def.v.length; i++) c.lineTo(W * def.v[i][0], BEACH_Y + sh * def.v[i][1]);
      c.closePath();
      const g = def.g;
      c.fillStyle   = `rgb(${g},${g},${g})`;
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth   = 0.85;
      c.stroke();
      /* top highlight */
      c.save(); c.clip();
      const hg = c.createLinearGradient(W * v0[0], BEACH_Y + sh * v0[1] - 12, W * v0[0], BEACH_Y + sh * v0[1]);
      hg.addColorStop(0, 'rgba(255,255,255,0.35)');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = hg;
      c.fillRect(W * v0[0] - 5, BEACH_Y + sh * v0[1] - 18, W * 0.15, sh * 0.08);
      c.restore();
      c.restore();
    }
  }

  /* ─── sea pixel renderer ────────────────────────────────────────────────── */
  function renderSea(t) {
    const d    = seaImgData.data;
    const PI2  = Math.PI * 2;
    const maxH = seaH - 1 || 1;

    for (let sy = 0; sy < seaH; sy++) {
      const ny      = sy / maxH;              /* 0 = horizon, 1 = foreshore */
      const pers    = 0.16 + ny * 0.84;       /* perspective compression    */
      const shoreP  = Math.max(0, (ny - 0.65) / 0.35);
      const atmosD  = 0.76 + ny * 0.24;       /* lighter near shore         */
      const row     = sy * seaW * 4;

      /* precompute time offsets (row-constant) */
      const tA = t * 0.340,  tB = t * 0.282 - ny * 1.9,  tC = t * 0.615;
      const tD = t * 0.492,  tE = t * 0.528,              tF = t * 0.885;
      const tG = t * 1.110,  tH = t * 0.435,              tI = t * 1.460;
      const tJ = t * 1.230;

      for (let sx = 0; sx < seaW; sx++) {
        const nx = sx / seaW;

        const pA  = nx * 5.5  * pers;
        const pB  = nx * 8.0  * pers;
        const pC  = nx * 13.0 * pers;
        const pD  = (nx + ny * 0.42) * 11.0 * pers;
        const pE  = (nx - ny * 0.29) *  8.0 * pers;
        const pF  = nx * 21.0 * pers + ny * 6.5;
        const pG  = ny * 15.0;
        const pH  = (nx + ny) * 9.5 * pers;
        const pI  = nx * 28.0 * pers;
        const pJ  = nx * 18.0 * pers - ny * 5.2;

        let h = 0;
        h += 0.34 * Math.sin(pA + tA);
        h += 0.26 * Math.sin(pB + tB);
        h += 0.18 * Math.sin(pC + tC);
        h += 0.14 * Math.sin(pD + tD);
        h += 0.12 * Math.sin(pE + tE);
        h += 0.09 * Math.sin(pF + tF);
        h += 0.07 * Math.sin(pG + tG);
        h += 0.08 * Math.sin(pH + tH);
        /* shore churn */
        h += shoreP * 0.28 * Math.sin(pI + tI);
        h += shoreP * 0.16 * Math.sin(pJ + tJ);

        /* h ≈ [-0.96, 0.96]  →  brightness [0,1] */
        const br = h * 0.5 + 0.5;

        const foamT = 0.665 - shoreP * 0.085;
        let grey;
        if (br > foamT) {
          grey = 205 + ((br - foamT) / (1 - foamT)) * 50;
        } else {
          grey = (36 + br * 158) * atmosD;
        }
        grey = grey < 18 ? 18 : grey > 255 ? 255 : grey | 0;

        const i  = row + sx * 4;
        d[i]     = grey;
        d[i + 1] = grey;
        d[i + 2] = grey;
        d[i + 3] = 255;
      }
    }
    seaCtx.putImageData(seaImgData, 0, 0);
  }

  /* ─── wave silhouette lines (drawn on top of pixel sea) ────────────────── */
  function drawWaveLines(c, t) {
    const sh = BEACH_Y - SEA_Y;
    const waves = [
      { yF: 0.12, amp: 4.5, spd: 0.32, lf: 0.62, lw: 0.70 },
      { yF: 0.28, amp: 6.0, spd: 0.36, lf: 0.56, lw: 0.80 },
      { yF: 0.46, amp: 7.5, spd: 0.41, lf: 0.50, lw: 0.90 },
      { yF: 0.63, amp: 9.5, spd: 0.46, lf: 0.44, lw: 1.00 },
      { yF: 0.80, amp:11.5, spd: 0.52, lf: 0.38, lw: 1.12 },
    ];
    c.save();
    c.strokeStyle = 'rgba(26,26,26,0.40)';
    c.lineCap = c.lineJoin = 'round';

    for (let wi = 0; wi < waves.length; wi++) {
      const w     = waves[wi];
      const yBase = SEA_Y + sh * w.yF;
      const λ     = W * w.lf;
      const phase = wi * Math.PI / 2.6;
      const endX  = CLIFF_X - wi * 22;
      c.lineWidth = w.lw;
      c.beginPath();
      let first = true;
      for (let x = 0; x <= endX; x += 3) {
        const y = yBase + w.amp * Math.sin(Math.PI * 2 * x / λ + t * w.spd + phase);
        first ? (c.moveTo(x, y), first = false) : c.lineTo(x, y);
      }
      c.stroke();

      /* foam curls on foreground waves */
      if (wi >= 3) {
        c.save();
        c.strokeStyle = 'rgba(26,26,26,0.28)';
        c.lineWidth   = 0.6;
        for (let ci = 0; ci < 6; ci++) {
          const xp   = endX * (0.08 + ci * 0.155);
          const y    = yBase + w.amp * Math.sin(Math.PI * 2 * xp / λ + t * w.spd + phase);
          const curl = 5.5 + ci * 0.7;
          const yo   = Math.sin(t * 0.6 + ci + wi) * 1.4;
          c.beginPath();
          c.moveTo(xp - curl, y + yo);
          c.quadraticCurveTo(xp, y - 3.5 + yo, xp + curl, y + yo);
          c.stroke();
        }
        c.restore();
      }
    }
    c.restore();
  }

  /* ─── main loop ─────────────────────────────────────────────────────────── */
  function loop(ts) {
    const dt = Math.min(ts - lastTs, 50);
    lastTs = ts;
    time  += dt * 0.001;

    renderSea(time);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    /* upscale sea pixels into sea zone, clipped left of cliff */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, SEA_Y - 2, CLIFF_X + 12, BEACH_Y - SEA_Y + 8);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(seaCanvas, 0, SEA_Y, seaW * SEA_SC, seaH * SEA_SC);
    ctx.restore();

    /* cliff, beach, rocks, atmosphere on top */
    ctx.drawImage(staticCanvas, 0, 0);

    /* wave outline strokes */
    drawWaveLines(ctx, time);

    requestAnimationFrame(loop);
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
