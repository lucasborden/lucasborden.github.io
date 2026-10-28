(function () {
  'use strict';

  var SKY_ROWS = 2; // pure-sky rows in the sea art

  /* Drawn on a canvas rather than as <pre> text so each sea row can slide
     by fractions of a character; whole-char steps made waves stutter.     */
  var canvas, ctx;
  var fontSize = 0, charW = 0, dpr = 1;
  var ROWS = [], CLIFF_ROWS = [];
  var PAD = [];
  var CLIFF_MAX_W = 303;

  /* Cliff and sea are drawn on a grid CLIFF_SCALE× finer than the layout
     grid (smaller glyphs), sampled from cliff.txt / coastal.txt with
     interpolated densities.
     CLIFF_LINES: one {x0, text} per fine row (leading spaces trimmed).
     COVER: per fine row, which fine columns the cliff occupies, so sea and
     sky chars underneath can be hidden.                                  */
  var CLIFF_SCALE = 2;
  var CLIFF_LINES = [], COVER = [];
  var CLIFF_RAMP = '.:-=+*#%@';

  /* Beach between sea and cliff base, per fine row (sea rows only):
     BEACH_X0: still-water line (fine col; -1 = no beach), BEACH_W: width
     to the cliff in fine cols, BEACH_P: perspective scale (narrow at the
     horizon), SAND: static dry-sand chars from BEACH_X0 to row end,
     WET: time each beach cell was last under water.
     SWASH: active swash events (one per wave reaching the beach).     */
  var BEACH_X0 = [], BEACH_W = [], BEACH_P = [], SAND = [], WET = [], FOAMT = [];
  var SWASH = [], nextSwashT = 1, swashId = 0;
  var FOAM_CHARS  = ['~', 'o', '~', '.', 'O', ',', '~', 'o'];
  var WHITE_CHARS = ['~', 'o', 'O', '*', '~', '%', 'o', '@', '~', '0'];
  var LACE_CHARS  = ['o', '.', '~', ',', 'o', ':'];

  /* spray droplets: {x, y (fine col/row), vx, vy (per s), g, y0, age, life, ch} */
  var SPRAY = [], SPRAY_MAX = 450;
  var SPRAY_CHARS = ['.', '.', ',', 'o', '.', "'", ',', 'o'];
  var frameDt = 0;
  var skyPad = 0, seaStart = 0;
  var time = 0, lastTs = 0, animId;

  var WAVE_CHARS = ['.', ':', '-', '=', '+', '*'];
  var CHAR_IDX   = { '.':0, ':':1, '-':2, '=':3, '+':4, '*':5 };

  /* sea art density 0-7 for interpolation: the six wave chars, then the
     heavy '#'/'%' which the art uses but brightness never modulates      */
  var SEA_HEAVY = ['#', '%'];
  function seaDensity(ch) {
    var d = CHAR_IDX[ch];
    if (d !== undefined) return d;
    return ch === '#' ? 6 : ch === '%' ? 7 : 0;
  }

  /* heaviness 0-8 used to feather the cliff's left edge:
     only the heaviest chars appear right at the boundary;
     lighter chars phase in further right, dissolving the hard line  */
  var CLIFF_H = { ' ':-1, '.':0, ':':1, '-':2, '=':3, '+':4, '*':5, '#':6, '%':7, '@':8 };

  /* ── init ─────────────────────────────────────────────────────── */
  function init() {
    canvas = document.createElement('canvas');
    canvas.style.cssText = [
      'position:fixed','bottom:0','left:0',
      'margin:0','padding:0','z-index:-1','pointer-events:none',
      'user-select:none',
      '-webkit-mask-image:linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.05) 10%,black 15%)',
      'mask-image:linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.05) 10%,black 15%)'
    ].join(';');
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');

    Promise.all([
      fetch('/coastal.txt').then(function(r){ return r.text(); }),
      fetch('/cliff.txt').then(function(r){ return r.text(); })
    ]).then(function(results) {
      var seaText   = results[0];
      var cliffText = results[1];

      /* sea art rows */
      ROWS = seaText.split('\n');
      var maxLen = 0;
      for (var i = 0; i < ROWS.length; i++) if (ROWS[i].length > maxLen) maxLen = ROWS[i].length;
      for (var i = 0; i < ROWS.length; i++) {
        if (ROWS[i].length < maxLen) ROWS[i] += new Array(maxLen - ROWS[i].length + 1).join('.');
      }

      /* cliff art rows */
      CLIFF_ROWS = cliffText.split('\n');
      while (CLIFF_ROWS.length && CLIFF_ROWS[CLIFF_ROWS.length-1].trim() === '') CLIFF_ROWS.pop();
      CLIFF_MAX_W = 0;
      for (var i = 0; i < CLIFF_ROWS.length; i++) if (CLIFF_ROWS[i].length > CLIFF_MAX_W) CLIFF_MAX_W = CLIFF_ROWS[i].length;

      resize();
      window.addEventListener('resize', debounce(resize, 180));
      cancelAnimationFrame(animId);
      animId = requestAnimationFrame(loop);
    });
  }

  /* ── resize ───────────────────────────────────────────────────── */
  function resize() {
    if (!ROWS.length) return;

    var artCols = ROWS[0].length;
    var artRows = ROWS.length;
    var fsW = window.innerWidth  / (artCols * 0.601);
    var fsH = window.innerHeight / artRows;
    var fs  = Math.min(fsW, fsH) * 0.72;
    fontSize = fs;

    charW       = fs * 0.601;
    var tgtCols = Math.ceil(window.innerWidth  / charW) + 2;
    var tgtRows = Math.ceil(window.innerHeight / fs)    + 2;

    /* ── sea pad ── */
    var padded = ROWS.map(function(r) {
      return r.length < tgtCols ? r + new Array(tgtCols - r.length + 1).join('.') : r;
    });
    skyPad = Math.max(0, tgtRows - artRows);
    var skyRow = new Array(tgtCols + 1).join('.');
    PAD = [];
    for (var i = 0; i < skyPad; i++) PAD.push(skyRow);
    for (var i = 0; i < padded.length; i++) PAD.push(padded[i]);
    seaStart = skyPad + SKY_ROWS;

    /* On tall/narrow viewports skyPad grows large (the 125-row sea art gets
       padded out to fill the height), pushing the horizon way down and
       leaving a big flat, static "sky" gap above the ocean — disconnected
       from the cliff, which (via buildCliff below) already spans the
       full viewport height. Cap the horizon at 20% down — high enough to
       connect the ocean to the cliff, low enough to leave a clear sky band
       above it.                                                            */
    var maxSeaStart = Math.round(tgtRows * 0.228);
    if (maxSeaStart < seaStart) seaStart = maxSeaStart;

    /* ── cliff: scale cliff art (165 rows × 306 cols) → fine grid ── */
    buildCliff(tgtRows, tgtCols);

    /* ── canvas: same footprint the <pre> had (bottom-anchored, one row per
       fs px, overflowing the top of the viewport) at device resolution ── */
    var cssW = window.innerWidth, cssH = PAD.length * fs;
    dpr = window.devicePixelRatio || 1;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width  = Math.ceil(cssW * dpr);
    canvas.height = Math.ceil(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = fs + 'px "Courier New",Courier,monospace';
    ctx.fillStyle = '#b0b0b0';
    ctx.textBaseline = 'middle';
    charW = ctx.measureText('.').width;
  }

  /* Static, per-row coastline-boundary offset. Same layered-sine idiom as
     the wave shading in loop() (sh1/sh2/sh3), but with NO time term — this
     is geometry baked once into CLIFF_LINES on resize, not per-frame motion.
     Four components at self-similar scales, weighted to sum to 1.0 so the
     result is analytically bounded to [-1, 1]: one dominant headland/bay,
     coves, and two jagged-rock tiers (the last detuned against the third
     so they don't beat into a regular ripple).                             */
  function coastBoundaryWobble(t) {
    var large = Math.sin(t * 8.8   + 0.60); /* ~1.4 cycles → 1-2 headlands/bays */
    var med   = Math.sin(t * 27.5  + 2.35); /* ~4.4 cycles → coves              */
    var fine  = Math.sin(t * 79.0  + 4.10); /* ~12.6 cycles → jagged rock steps */
    var rough = Math.sin(t * 132.0 + 1.05); /* detuned fine jag                 */
    return 0.50 * large + 0.30 * med + 0.13 * fine + 0.07 * rough;
  }

  function buildCliff(tgtRows, tgtCols) {
    var nCliff = CLIFF_ROWS.length;

    /* cliff width wobbles per row around a 22% baseline (±11%, bounded by
       coastBoundaryWobble's [-1,1] range) — headlands push it out toward
       the sea, inlets/coves pull it back — instead of one fixed column
       for every row. Feather band is a smaller fraction of the cliff zone
       now that the boundary's shape itself breaks up the hard edge.        */
    var baseCliffW = tgtCols * 0.22;
    var ampCliffW  = tgtCols * 0.11;
    var minCliffW  = Math.round(tgtCols * 0.09);
    var maxCliffW  = Math.round(tgtCols * 0.35);
    var BLEND_FRAC = 0.18;

    /* Cliff art transition-density stays rich through ~90% of the source
       rows (photo texture, not the flat base blob) — only the last ~10%
       flattens into long uniform runs, so use up to that point.            */
    var cliffArtLimit = Math.round(nCliff * 0.90);

    var S     = CLIFF_SCALE;
    var fRows = tgtRows * S, fCols = tgtCols * S;
    var nRows = PAD.length;

    COVER = new Array(fRows);
    for (var fi = 0; fi < fRows; fi++) COVER[fi] = new Uint8Array(fCols);
    CLIFF_LINES = new Array(fRows);

    for (var fi = 0; fi < fRows; fi++) {
      var t = fi / Math.max(1, fRows - 1);
      var i = Math.floor(fi / S); /* coarse (sea-grid) row */

      var wobble = coastBoundaryWobble(t);
      var cliffW = Math.round((baseCliffW + wobble * ampCliffW) * S);
      if (cliffW < minCliffW * S) cliffW = minCliffW * S;
      if (cliffW > maxCliffW * S) cliffW = maxCliffW * S;
      var seaW   = fCols - cliffW;
      var blendW = Math.max(1, Math.round(cliffW * BLEND_FRAC));

      /* gentle fade in the last 8% of sea rows so the cliff meets the
         footer cleanly (sky rows show all non-space cliff chars)        */
      var fadeMinH = 0;
      if (i >= seaStart) {
        var progress = (i - seaStart) / (nRows - seaStart);
        if (progress > 0.92) fadeMinH = Math.round((progress - 0.92) / 0.08 * 8);
      }

      /* vertical mapping: cliff art rows 0..cliffArtLimit → full viewport,
         as a fractional source row for interpolation                     */
      var rowF = fi * (cliffArtLimit - 1) / Math.max(1, fRows - 1);
      var r0   = Math.floor(rowF);
      var r1   = Math.min(r0 + 1, cliffArtLimit - 1);
      var fy   = rowF - r0;

      var buf = new Array(cliffW);
      var first = -1, last = -1;
      for (var k = 0; k < cliffW; k++) {
        /* scale cliff art into the right cliffW columns, fractionally */
        var colF = k * CLIFF_MAX_W / cliffW;
        var c0   = Math.floor(colF);
        var fx   = colF - c0;
        var d = (1 - fy) * ((1 - fx) * cliffDensity(r0, c0) + fx * cliffDensity(r0, c0 + 1))
              +      fy  * ((1 - fx) * cliffDensity(r1, c0) + fx * cliffDensity(r1, c0 + 1));
        var h = Math.round(d);

        /* feather: in the blend band, suppress chars below the local threshold.
           At k=0 only @/%/# survive; threshold drops to 0 at k=blendW        */
        if (k < blendW && h < Math.round(8 * (1 - k / blendW))) h = -1;
        if (h < fadeMinH) h = -1;

        if (h < 0) { buf[k] = ' '; continue; }
        buf[k] = CLIFF_RAMP[h];
        if (first < 0) first = k;
        last = k;
        COVER[fi][seaW + k] = 1;
      }

      CLIFF_LINES[fi] = first < 0 ? null
        : { x0: seaW + first, text: buf.slice(first, last + 1).join('') };

      /* beach: a strip of sand in front of the cliff base on sea rows,
         narrowing toward the horizon; width wobbles gently along shore  */
      BEACH_X0[fi] = -1;
      if (i >= seaStart) {
        var iF    = (fi + 0.5) / S - 0.5;
        var persp = 0.3 + 0.7 * Math.max(0, (iF - seaStart) / (nRows - seaStart));
        var bw    = Math.max(2, Math.round(fCols * (0.085 + 0.015 * Math.sin(t * 11.0 + 1.3)) * persp));
        var bx0   = seaW - bw;
        BEACH_X0[fi] = bx0;
        BEACH_W[fi]  = bw;
        BEACH_P[fi]  = persp;
        WET[fi]      = new Float32Array(fCols - bx0).fill(-1e9);
        FOAMT[fi]    = new Float32Array(fCols - bx0).fill(-1e9);
        var sand = new Array(fCols - bx0);
        for (var k = 0; k < sand.length; k++) {
          var hs = hash2(bx0 + k, fi);
          sand[k] = hs < 0.26 ? '.' : hs < 0.31 ? ',' : hs < 0.33 ? '`' : ' ';
        }
        SAND[fi] = sand;
      }
    }
  }

  /* deterministic 0..1 noise for a grid cell */
  function hash2(a, b) {
    var h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ── swash: waves running up the beach and draining back ──────────
     Each wave that reaches the beach is an event whose front follows a
     ballistic path up the slope: fast uprush decelerating under gravity
     to its maximum runup, then a slower, accelerating backwash (water
     percolates into the sand). The shoreline is the furthest-up front of
     all live events, so a new uprush overruns the previous backwash.
     Runup follows the incoming sea: bigger during the wave-group
     envelope (sets) and when a brightness crest is arriving at shore,
     with random spread, oblique arrival, alongshore bulges and the odd
     sneaker wave that reaches the cliff.                               */
  function spawnSwash() {
    var nRows  = PAD.length;
    var iShore = nRows - 1;
    while (nextSwashT < time + 3) {
      var t0 = nextSwashT;
      /* same envelope as the sea rows' env term, at the shore row: 0..1 */
      var g  = 0.5 + 0.5 * Math.sin(t0 * 0.045 + iShore * 0.07);
      /* phase of the sea's main brightness crest at the shoreline       */
      var crest = Math.sin(0.06 * PAD[0].length * 0.75 - t0 * 0.10 + iShore * 0.16 + 2.1);

      var R = (0.45 + 0.40 * Math.random()) * (0.55 + 0.55 * g) * (1 + 0.2 * crest);
      if (g > 0.7 && Math.random() < 0.35) R *= 1.35;  /* set wave      */
      if (Math.random() < 0.08) R *= 1.8;              /* sneaker wave  */
      if (R > 1.6) R = 1.6;

      var Tu = 2.2 + 3.2 * R;                          /* uprush, s   */

      /* spray comes in a few bursts per wave at random places and moments,
         not a steady drizzle: small waves rarely throw any, big ones throw
         several, plus plumes where they hit the cliff                     */
      var bursts = [];
      var nB = Math.floor(R * R * 2.2 + Math.random() * 1.2);
      for (var b = 0; b < nB; b++) {
        bursts.push({ at: Tu * (0.05 + 0.5 * Math.random()), along: Math.random(),
                      size: 0.3 + 0.7 * Math.random(), cliff: false });
      }
      if (R > 0.95) {
        var nC = 1 + Math.floor((R - 0.95) * 6 * Math.random());
        for (var c = 0; c < nC; c++) {
          bursts.push({ at: Tu * (0.75 + 0.3 * Math.random()), along: Math.random(),
                        size: 0.5 + 0.5 * Math.random(), cliff: true });
        }
      }

      SWASH.push({
        id: swashId++, t0: t0, R: R, Tu: Tu,
        Td: Tu * (1.5 + 0.4 * Math.random()),          /* backwash, s */
        obl: (Math.random() - 0.5) * 2.4,              /* s of sweep along the beach */
        ca: 0.12 + 0.15 * Math.random(),               /* alongshore bulges */
        cf: 12 + 18 * Math.random(),
        cp: Math.random() * 6.283,
        bursts: bursts
      });
      /* waves come closer together during sets */
      nextSwashT += (7 + 7 * Math.random()) * (1.2 - 0.35 * g);
    }
    while (SWASH.length && time > SWASH[0].t0 + 2 + SWASH[0].Tu + SWASH[0].Td) SWASH.shift();
  }

  /* shoreline for fine row fi: distance (fine cols) the water has run up
     past the still-water line, and the event leading it                 */
  function swashEdge(fi, fRows, bw, persp) {
    var t    = fi / Math.max(1, fRows - 1);
    /* slow surf beat: the still-water line breathes with the sets */
    var edge = bw * (0.04 + 0.04 * Math.sin(time * 0.084 + t * 3.0)) * persp;
    var lead = null, up = false;
    for (var w = 0; w < SWASH.length; w++) {
      var e   = SWASH[w];
      var tau = time - (e.t0 + e.obl * (t - 0.5));
      if (tau < 0 || tau > e.Tu + e.Td) continue;
      var Rr = e.R * bw * (1 + e.ca * Math.sin(t * e.cf + e.cp))
                        * (1 + 0.1 * Math.sin(t * 40.0 + 0.7)); /* beach cusps */
      var x;
      if (tau < e.Tu) { var a = 1 - tau / e.Tu;          x = Rr * (1 - a * a); }
      else            { var b = (tau - e.Tu) / e.Td;     x = Rr * (1 - b * b); }
      if (x > edge) { edge = x; lead = e; up = tau < e.Tu; }
    }

    /* turbulence: the front breaks into ragged tongues that writhe as it
       moves, stronger for bigger waves and on the uprush                 */
    if (lead) {
      var turb = lead.R * bw * 0.07 * (up ? 1.0 : 0.55);
      edge += turb * (Math.sin(t * 97.0  + time * 1.4 + lead.cp)
               + 0.7 * Math.sin(t * 211.0 - time * 2.3 + lead.cf)
               + 0.4 * Math.sin(t * 431.0 + time * 3.6));
      if (edge < 0) edge = 0;
    }

    return { edge: edge, lead: lead, up: up };
  }

  /* whitewater density 0..1 at fine col k of the surf zone (k < bx0): each
     wave breaks offshore and its bore rolls in to the still-water line,
     arriving at the beach at its swash start; behind the roller a foam
     field lingers and decays. Bigger waves break further out.           */
  function whitewater(k, bx0, bw, t) {
    var dens = 0;
    for (var w = 0; w < SWASH.length; w++) {
      var e     = SWASH[w];
      var surfW = bw * (0.5 + 0.9 * e.R);
      var dist  = bx0 - k;
      if (dist > surfW) continue;
      var Tb  = 2.0 + 2.0 * e.R;                       /* bore transit, s */
      var ta  = e.t0 + e.obl * (t - 0.5);              /* arrival at beach */
      var dtk = time - (ta - Tb * dist / surfW);       /* since bore passed k */
      if (dtk < 0) continue;
      var trail = (0.25 + 0.35 * e.R);                 /* roller, s */
      var d = dtk < trail ? 0.75 + 0.25 * e.R
            : Math.min(1, 0.4 + e.R) * Math.exp(-(dtk - trail) / (0.8 + 1.4 * e.R));
      /* foam thins toward where the wave first broke */
      d *= 0.55 + 0.45 * (1 - dist / surfW);
      if (d > dens) dens = d;
    }
    return dens;
  }

  /* fling a spray droplet from fine cell (x, y); h = rise in fine rows */
  function spray(x, y, h, vx, persp) {
    if (SPRAY.length >= SPRAY_MAX) return;
    var g = 40 * persp;
    SPRAY.push({
      x: x, y: y, y0: y, vx: vx, vy: -Math.sqrt(2 * g * Math.max(0.5, h)),
      g: g, age: 0, life: 0.5 + 1.8 * Math.random(),
      ch: SPRAY_CHARS[Math.floor(Math.random() * SPRAY_CHARS.length)]
    });
  }

  /* fire any spray bursts whose moment has come: a clump of droplets
     thrown from the water's edge (or the cliff base) around one spot   */
  function emitBursts() {
    var fRows = BEACH_X0.length;
    for (var w = 0; w < SWASH.length; w++) {
      var e = SWASH[w];
      for (var b = 0; b < e.bursts.length; b++) {
        var u = e.bursts[b];
        if (u.done || time < e.t0 + e.obl * (u.along - 0.5) + u.at) continue;
        u.done = true;

        var fc = Math.round(u.along * (fRows - 1));
        if (!(BEACH_X0[fc] >= 0)) continue;
        var span  = Math.max(1, Math.round((2 + 5 * u.size) * BEACH_P[fc] * CLIFF_SCALE));
        var count = Math.round((4 + 14 * u.size) * e.R * (u.cliff ? 1.5 : 1));
        for (var n = 0; n < count; n++) {
          /* droplets bunch toward the burst's centre */
          var r = fc + Math.round((Math.random() + Math.random() - 1) * span);
          if (!(BEACH_X0[r] >= 0)) continue;
          var bw = BEACH_W[r], persp = BEACH_P[r];
          var sw = swashEdge(r, fRows, bw, persp);
          if (u.cliff) {
            if (sw.edge < bw * 0.85) continue;           /* didn't reach here */
            spray(BEACH_X0[r] + bw - Math.random() * 2, r,
                  (5 + 22 * e.R * u.size * Math.random()) * persp,
                  -(2 + 12 * Math.random()) * persp, persp);
          } else {
            spray(BEACH_X0[r] + sw.edge - Math.random() * 2, r,
                  (1.5 + 9 * e.R * u.size * Math.random()) * persp,
                  (Math.random() * 9 - 2) * persp, persp);
          }
        }
      }
    }
  }

  /* move droplets; landing ones wet (and fleck with foam) the sand */
  function updateSpray(dt) {
    var keep = [];
    for (var p = 0; p < SPRAY.length; p++) {
      var d = SPRAY[p];
      d.age += dt;
      d.vy  += d.g * dt;
      d.vx  *= Math.pow(0.6, dt);                      /* air drag */
      d.x   += d.vx * dt;
      d.y   += d.vy * dt;
      if (d.vy > 0 && d.y >= d.y0) {
        var fi = Math.round(d.y0), k = Math.round(d.x);
        var bx0 = BEACH_X0[fi];
        if (bx0 >= 0 && k >= bx0 && k - bx0 < WET[fi].length) {
          WET[fi][k - bx0] = time;
          if (Math.random() < 0.3) FOAMT[fi][k - bx0] = time;
        }
        continue;
      }
      if (d.age < d.life) keep.push(d);
    }
    SPRAY = keep;
  }

  /* density 0-8 of a source cliff char; -1 for empty or out of range */
  function cliffDensity(r, c) {
    var h = CLIFF_H[(CLIFF_ROWS[r] || '')[c]];
    return h === undefined ? -1 : h;
  }

  /* ── render loop ──────────────────────────────────────────────── */
  function loop(ts) {
    animId = requestAnimationFrame(loop);
    if (!PAD.length || !CLIFF_LINES.length) return;

    var dt = ts - lastTs;
    if (dt > 100) dt = 100;
    lastTs = ts;
    time  += dt * 0.001;

    frameDt = dt * 0.001;
    spawnSwash();
    emitBursts();
    updateSpray(frameDt);

    var nRows = PAD.length;
    var S     = CLIFF_SCALE;
    var fineH = fontSize / S, fineW = charW / S;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.font = fineH + 'px "Courier New",Courier,monospace';

    /* Sea and sky are drawn on the fine grid. Each fine row fi sits at a
       fractional layout-row coordinate iF; all wave motion below is in
       layout (coarse) char units, exactly as before, just sampled finer.  */
    for (var fi = 0; fi < nRows * S; fi++) {
      var iF    = (fi + 0.5) / S - 0.5;
      var cover = COVER[fi];
      var fLen  = cover ? cover.length : PAD[0].length * S;
      var chars = new Array(fLen);
      var y     = (fi + 0.5) * fineH;

      /* ── sky rows: dots background; cliff drawn over it below ── */
      if (Math.floor(fi / S) < seaStart) {
        for (var k = 0; k < fLen; k++) chars[k] = (cover && cover[k]) ? ' ' : '.';
        ctx.fillText(chars.join(''), 0, y);
        continue;
      }

      /* ── sea rows: wave animation ── */
      var progress = Math.max(0, (iF - seaStart) / (nRows - seaStart)); /* 0=horizon 1=shore */

      /* rightward drift: waves travel toward the cliff.
         Open sea (progress≈0) moves at ~8 chars/s and slows to ~4 near shore
         (shoaling: speed drops, amplitude grows, period lengthens).           */
      var drift  = time * (8.0 - progress * 4.0);

      /* amplitude grows near shore — waves pile up as depth decreases         */
      var amp1 = 16 + progress * 26; /* 16–42 chars at shore    */
      var amp2 =  8 + progress * 16; /*  8–24 chars             */
      var amp3 =  4 + progress * 11; /*  4–15 foreground chop   */

      /* slowly varying envelope: wave groups every ~120 s                     */
      var env  = 0.72 + 0.28 * Math.sin(time * 0.045 + iF * 0.07);

      /* oscillation period lengthens near shore (shoaling: slower, longer).
         SWAY slows the oscillations so their combined speed (max ~3.4 chars/s
         at shore) never exceeds the drift (4 chars/s at shore): rows surge and
         ease toward the cliff but never slide back out to sea.                */
      var SWAY = 0.30;
      var sh1  = Math.sin(time * SWAY * (0.10 - progress * 0.03) + iF * 0.23      ) * amp1;
      var sh2  = Math.sin(time * SWAY * (0.21 - progress * 0.05) + iF * 0.41 + 2.1) * amp2;
      var sh3  = Math.sin(time * SWAY * (0.38 - progress * 0.08) + iF * 0.57 + 4.5) * amp3;

      /* -drift = rightward; oscillations add wave-action variation around it.
         Whole fine chars index the art; the remaining fraction is a
         sub-character pixel offset, so rows glide instead of stepping.       */
      var shiftF = (-drift + (sh1 + sh2 + sh3) * env) * S; /* in fine chars */
      var whole  = Math.floor(shiftF);
      var frac   = shiftF - whole;            /* 0..1: row drawn frac chars left */

      /* source art rows above/below this fine row, blended vertically */
      var r0 = Math.min(nRows - 1, Math.floor(iF));
      var r1 = Math.min(nRows - 1, r0 + 1);
      var fy = iF - r0;
      var rowA = PAD[r0], rowB = PAD[r1];
      var lenA = rowA.length, lenB = rowB.length;

      /* brightness crests sweep rightward (- before bSpd reverses direction).
         Speed also slows near shore to match the slower swell period.
         Sampled at each char's true screen position (xs = (k-frac)/S) and
         stepped along the row by rotation instead of a sin() per char.      */
      var bFreq = 0.022 + progress * 0.038;
      var bSpd  = 0.14  - progress * 0.04; /* 0.14 at horizon → 0.10 at shore */
      var bPhi  = iF * 0.16 + progress * 2.1;
      var xs0   = -frac / S;
      /* minus sign on bSpd terms = crests travel left→right toward cliff   */
      var p1 = xs0 * bFreq         - time * bSpd        + bPhi;
      var p2 = xs0 * bFreq * 1.618 - time * bSpd * 0.79 + bPhi * 0.6;
      var p3 = xs0 * bFreq * 2.414 - time * bSpd * 1.27 + bPhi * 1.4;
      var s1 = Math.sin(p1), c1 = Math.cos(p1), d1s = Math.sin(bFreq / S),         d1c = Math.cos(bFreq / S);
      var s2 = Math.sin(p2), c2 = Math.cos(p2), d2s = Math.sin(bFreq * 1.618 / S), d2c = Math.cos(bFreq * 1.618 / S);
      var s3 = Math.sin(p3), c3 = Math.cos(p3), d3s = Math.sin(bFreq * 2.414 / S), d3c = Math.cos(bFreq * 2.414 / S);

      for (var k = 0; k < fLen; k++) {
        /* char k is drawn spanning fine cols k-frac..k+1-frac: hide it
           wherever it would overlap a visible cliff char                    */
        if (cover && (cover[k] || (k > 0 && cover[k - 1]))) {
          chars[k] = ' ';
        } else {
          /* art coordinate u = (k + whole) / S layout chars, interpolated */
          var n  = k + whole;
          var u0 = Math.floor(n / S);
          var fx = (n - u0 * S) / S;
          var a0 = ((u0 % lenA) + lenA) % lenA, a1 = (a0 + 1) % lenA;
          var b0 = ((u0 % lenB) + lenB) % lenB, b1 = (b0 + 1) % lenB;
          var bi = (1 - fy) * ((1 - fx) * seaDensity(rowA[a0]) + fx * seaDensity(rowA[a1]))
                 +      fy  * ((1 - fx) * seaDensity(rowB[b0]) + fx * seaDensity(rowB[b1]));
          bi = Math.round(bi);

          if (bi > 5) {
            chars[k] = SEA_HEAVY[bi - 6]; /* '#'/'%': unmodulated, as in the art */
          } else {
            var wave = s1, wave2 = s2, wave3 = s3;

            /* stepped delta: three levels per component for max contrast range   */
            var delta = wave > 0.65 ? 3 : wave > 0.30 ? 2 : wave > 0.10 ? 1
                      : wave < -0.65 ? -3 : wave < -0.30 ? -2 : wave < -0.10 ? -1 : 0;
            if (wave2 >  0.45) delta += 1;
            if (wave2 < -0.45) delta -= 1;
            if (wave3 >  0.55) delta += 1;

            /* foreshore crests flash bright (foam) */
            if (progress > 0.60 && wave > 0.55) delta -= 2;

            chars[k] = WAVE_CHARS[Math.min(5, Math.max(0, bi + delta))];
          }
        }

        /* advance the three brightness waves by one fine column */
        var t1 = s1 * d1c + c1 * d1s; c1 = c1 * d1c - s1 * d1s; s1 = t1;
        var t2 = s2 * d2c + c2 * d2s; c2 = c2 * d2c - s2 * d2s; s2 = t2;
        var t3 = s3 * d3c + c3 * d3s; c3 = c3 * d3c - s3 * d3s; s3 = t3;
      }

      /* ── beach: swash water, foam and sand from the still-water line to
         the cliff. Drawn unshifted so the sand stays put; the sea row
         (drawn frac chars left) is cut off at the still-water line.    */
      var bx0 = BEACH_X0[fi];
      if (bx0 >= 0 && bx0 < fLen) {
        var bw     = BEACH_W[fi], persp = BEACH_P[fi];
        var tRow   = fi / Math.max(1, nRows * S - 1);
        var sw     = swashEdge(fi, nRows * S, bw, persp);
        var edgeX  = bx0 + sw.edge;                /* fine col of the water's edge */
        var leadR  = sw.lead ? sw.lead.R : 0.3;
        var foamW  = (1.5 + 3.0 * persp) * (0.6 + 0.9 * leadR) * (sw.up ? 1.0 : 0.6);
        var foamId = sw.lead ? sw.lead.id : 0;
        var wet    = WET[fi], foamt = FOAMT[fi], sand = SAND[fi];

        /* surf zone: whitewater replaces the sea texture where it churns;
           cells change at desynchronised random moments (~9/s) so the
           foam boils rather than sliding                                 */
        var sx0  = Math.max(0, Math.floor(bx0 - bw * 1.8));
        var surf = new Array(bx0 - sx0);
        var anyWhite = false;
        for (var k = sx0; k < bx0; k++) {
          var dens = whitewater(k, bx0, bw, tRow);
          var flick = Math.floor(time * (1.5 + 2.5 * hash2(k, fi * 5 + 3)) + hash2(k, fi * 5 + 2) * 9);
          if (dens > 0 && hash2(k * 13 + flick, fi) < dens) {
            surf[k - sx0] = WHITE_CHARS[Math.floor(hash2(k + flick * 31, fi * 7) * WHITE_CHARS.length)];
            chars[k] = ' ';                         /* sea chars k, k+1 overlap cell k */
            if (k + 1 < bx0) chars[k + 1] = ' ';
            anyWhite = true;
          } else surf[k - sx0] = ' ';
        }
        if (anyWhite) ctx.fillText(surf.join(''), sx0 * fineW, y);

        var beach = new Array(fLen - bx0);
        for (var k = bx0; k < fLen; k++) {
          var j  = k - bx0;
          var sc = chars[k];
          chars[k] = ' ';
          if (cover && cover[k]) { beach[j] = ' '; continue; }

          var behind = edgeX - k;                  /* >0: under water */
          var flick  = Math.floor(time * (1.5 + 2.5 * hash2(k, fi * 5 + 3)) + hash2(k, fi * 5 + 2) * 9);
          if (behind > 0.5) {
            wet[j] = time;
            if (behind < foamW + 0.5) {
              /* churning foam at the leading edge: thick bore on the
                 uprush, broken scatter on the backwash                */
              foamt[j] = time;
              var hf = hash2(k * 7 + foamId + flick * 17, fi);
              beach[j] = (!sw.up && hf < 0.45) ? ':' : FOAM_CHARS[Math.floor(hf * FOAM_CHARS.length)];
            } else {
              /* swash sheet: the sea texture, lightened, flecked with
                 turbulent foam that grows with the wave              */
              var si = CHAR_IDX[sc];
              if (hash2(k * 3 + flick, fi * 11) < 0.05 + 0.15 * leadR * (sw.up ? 1 : 0.5)) {
                beach[j] = FOAM_CHARS[Math.floor(hash2(k + flick, fi) * FOAM_CHARS.length)];
              } else {
                beach[j] = si === undefined ? (sc === ' ' ? ' ' : '*') : WAVE_CHARS[Math.max(0, si - 2)];
              }
            }
          } else {
            /* exposed sand: foam lace left by the backwash dissolves,
               wet sand dries back to dry sand in speckles              */
            var fage = time - foamt[j];
            var age  = time - wet[j];
            var dry  = 3 + 7 * hash2(k, fi * 3 + 1);
            if (fage < 3 && hash2(k + Math.floor(time * (0.6 + 0.8 * hash2(k, fi * 13 + 5)) + hash2(k, fi) * 4) * 7, fi * 13) < 0.55 * (1 - fage / 3)) {
              beach[j] = LACE_CHARS[Math.floor(hash2(k, fi * 17) * LACE_CHARS.length)];
            } else {
              beach[j] = age < dry * 0.45 ? ';' : age < dry ? ':' : sand[j];
            }
          }
        }
        ctx.fillText(beach.join(''), bx0 * fineW, y);
      }

      ctx.fillText(chars.join(''), -frac * fineW, y);
    }

    /* ── cliff: static, on the finer grid, drawn over sky and sea ── */
    for (var fi = 0; fi < CLIFF_LINES.length; fi++) {
      var line = CLIFF_LINES[fi];
      if (line) ctx.fillText(line.text, line.x0 * fineW, (fi + 0.5) * fineH);
    }

    /* ── spray: in front of everything, including the cliff face ── */
    for (var p = 0; p < SPRAY.length; p++) {
      var d = SPRAY[p];
      ctx.fillText(d.ch, d.x * fineW, (d.y + 0.5) * fineH);
    }
  }

  function debounce(fn, ms) {
    var t;
    return function() { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
