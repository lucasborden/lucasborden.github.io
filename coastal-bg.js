(function () {
  'use strict';

  var SKY_ROWS = 2; // pure-sky rows in the sea art

  var pre;
  var ROWS = [], CLIFF_ROWS = [];
  var PAD = [], CLIFF_PAD = [];
  var CLIFF_MAX_W = 303;
  var skyPad = 0, seaStart = 0;
  var time = 0, lastTs = 0, animId;

  var WAVE_CHARS = ['.', ':', '-', '=', '+', '*'];
  var CHAR_IDX   = { '.':0, ':':1, '-':2, '=':3, '+':4, '*':5 };

  /* heaviness 0-8 used to feather the cliff's left edge:
     only the heaviest chars appear right at the boundary;
     lighter chars phase in further right, dissolving the hard line  */
  var CLIFF_H = { ' ':-1, '.':0, ':':1, '-':2, '=':3, '+':4, '*':5, '#':6, '%':7, '@':8 };

  /* ── init ─────────────────────────────────────────────────────── */
  function init() {
    pre = document.createElement('pre');
    pre.style.cssText = [
      'position:fixed','bottom:0','left:0','right:0',
      'margin:0','padding:0','z-index:-1','pointer-events:none',
      'overflow:hidden','white-space:pre','line-height:1.0',
      'color:#b0b0b0','font-family:"Courier New",Courier,monospace',
      'user-select:none',
      '-webkit-mask-image:linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.05) 10%,black 15%)',
      'mask-image:linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.05) 10%,black 15%)'
    ].join(';');
    document.body.insertBefore(pre, document.body.firstChild);

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
    pre.style.fontSize = fs + 'px';

    var charW   = fs * 0.601;
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
       from the cliff, which (via buildCliffPad below) already spans the
       full viewport height. Cap the horizon at 20% down — high enough to
       connect the ocean to the cliff, low enough to leave a clear sky band
       above it.                                                            */
    var maxSeaStart = Math.round(tgtRows * 0.228);
    if (maxSeaStart < seaStart) seaStart = maxSeaStart;

    /* ── cliff pad: scale cliff art (166 rows × 303 cols) → viewport ── */
    CLIFF_PAD = buildCliffPad(tgtRows, tgtCols);
  }

  /* Static, per-row coastline-boundary offset. Same layered-sine idiom as
     the wave shading in loop() (sh1/sh2/sh3), but with NO time term — this
     is geometry baked once into CLIFF_PAD on resize, not per-frame motion.
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

  function buildCliffPad(tgtRows, tgtCols) {
    var nCliff = CLIFF_ROWS.length;
    var result  = new Array(tgtRows);

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

    for (var i = 0; i < tgtRows; i++) {
      var t = i / Math.max(1, tgtRows - 1);

      var wobble = coastBoundaryWobble(t);
      var cliffW = Math.round(baseCliffW + wobble * ampCliffW);
      if (cliffW < minCliffW) cliffW = minCliffW;
      if (cliffW > maxCliffW) cliffW = maxCliffW;
      var seaW   = tgtCols - cliffW;
      var blendW = Math.max(1, Math.round(cliffW * BLEND_FRAC));

      /* vertical mapping: cliff art rows 0..cliffArtLimit → full viewport  */
      var ci   = Math.round(i * (cliffArtLimit - 1) / Math.max(1, tgtRows - 1));
      ci       = Math.min(ci, cliffArtLimit - 1);
      var crow = CLIFF_ROWS[ci] || '';

      var buf = new Array(tgtCols);
      for (var x = 0; x < tgtCols; x++) {
        if (x < seaW) {
          buf[x] = ' '; /* guaranteed sea */
          continue;
        }
        /* scale cliff art into right cliffW columns */
        var cx = Math.round((x - seaW) * CLIFF_MAX_W / cliffW);
        var ch = (cx < crow.length) ? crow[cx] : ' ';

        /* feather: in the blend band, suppress chars below the local threshold.
           At x=seaW only @/%/# survive; threshold drops to 0 at x=seaW+blendW */
        var dist = x - seaW;
        if (dist < blendW) {
          var minH = Math.round(8 * (1 - dist / blendW)); /* 8 → 0            */
          var h    = (CLIFF_H[ch] !== undefined) ? CLIFF_H[ch] : 5;
          if (h < minH) ch = ' ';
        }

        buf[x] = ch;
      }
      result[i] = buf.join('');
    }
    return result;
  }

  /* ── render loop ──────────────────────────────────────────────── */
  function loop(ts) {
    animId = requestAnimationFrame(loop);
    if (!PAD.length || !CLIFF_PAD.length) return;

    var dt = ts - lastTs;
    if (dt > 100) dt = 100;
    lastTs = ts;
    time  += dt * 0.001;

    var nRows = PAD.length;
    var lines = new Array(nRows);

    for (var i = 0; i < nRows; i++) {
      var row      = PAD[i];
      var len      = row.length;
      var cliffRow = CLIFF_PAD[i] || '';
      var chars    = new Array(len);

      /* ── sky rows: dots background, full cliff texture overlaid ── */
      if (i < seaStart) {
        for (var x = 0; x < len; x++) {
          var cc = cliffRow[x] || ' ';
          var hh = (CLIFF_H[cc] !== undefined) ? CLIFF_H[cc] : -1;
          chars[x] = (hh >= 0) ? cc : '.';
        }
        lines[i] = chars.join('');
        continue;
      }

      /* ── sea rows: wave animation ── */
      var progress = (i - seaStart) / (nRows - seaStart); /* 0=horizon 1=shore */

      /* rightward drift: waves travel toward the cliff.
         Open sea (progress≈0) moves at ~8 chars/s and slows to ~4 near shore
         (shoaling: speed drops, amplitude grows, period lengthens).           */
      var drift  = Math.round(time * (8.0 - progress * 4.0));

      /* amplitude grows near shore — waves pile up as depth decreases         */
      var amp1 = 16 + Math.round(progress * 26); /* 16–42 chars at shore    */
      var amp2 =  8 + Math.round(progress * 16); /*  8–24 chars             */
      var amp3 =  4 + Math.round(progress * 11); /*  4–15 foreground chop   */

      /* slowly varying envelope: wave groups every ~120 s                     */
      var env  = 0.72 + 0.28 * Math.sin(time * 0.045 + i * 0.07);

      /* oscillation period lengthens near shore (shoaling: slower, longer)    */
      var sh1  = Math.round(Math.sin(time * (0.10 - progress * 0.03) + i * 0.23        ) * amp1);
      var sh2  = Math.round(Math.sin(time * (0.21 - progress * 0.05) + i * 0.41 + 2.1  ) * amp2);
      var sh3  = Math.round(Math.sin(time * (0.38 - progress * 0.08) + i * 0.57 + 4.5  ) * amp3);

      /* -drift = rightward; oscillations add wave-action variation around it  */
      var shift = -drift + Math.round((sh1 + sh2 + sh3) * env);
      var s     = ((shift % len) + len) % len;
      var shifted = row.slice(s) + row.slice(0, s);

      /* brightness crests sweep rightward (- before bSpd reverses direction).
         Speed also slows near shore to match the slower swell period.         */
      var bFreq = 0.022 + progress * 0.038;
      var bSpd  = 0.14  - progress * 0.04; /* 0.14 at horizon → 0.10 at shore */
      var bPhi  = i * 0.16 + progress * 2.1;

      for (var x = 0; x < len; x++) {
        var ch = shifted[x];
        var bi = CHAR_IDX[ch];
        if (bi === undefined) { chars[x] = ch; continue; }

        /* minus sign on bSpd terms = crests travel left→right toward cliff   */
        var wave  = Math.sin(x * bFreq          - time * bSpd          + bPhi);
        var wave2 = Math.sin(x * bFreq * 1.618  - time * bSpd * 0.79   + bPhi * 0.6);
        var wave3 = Math.sin(x * bFreq * 2.414  - time * bSpd * 1.27   + bPhi * 1.4);

        /* stepped delta: three levels per component for max contrast range   */
        var delta = wave > 0.65 ? 3 : wave > 0.30 ? 2 : wave > 0.10 ? 1
                  : wave < -0.65 ? -3 : wave < -0.30 ? -2 : wave < -0.10 ? -1 : 0;
        if (wave2 >  0.45) delta += 1;
        if (wave2 < -0.45) delta -= 1;
        if (wave3 >  0.55) delta += 1;

        /* foreshore crests flash bright (foam) */
        if (progress > 0.60 && wave > 0.55) delta -= 2;

        chars[x] = WAVE_CHARS[Math.min(5, Math.max(0, bi + delta))];
      }

      /* cliff overlay: runs to the footer (no cutoff).
         All non-space cliff chars (hh >= 0) show for full marbling texture.
         Gentle fade in the last 8% so the cliff meets the footer cleanly.  */
      {
        var fadeRatio  = progress > 0.92 ? (progress - 0.92) / 0.08 : 0;
        var cliffMinH  = Math.round(fadeRatio * 8);
        for (var x = 0; x < len; x++) {
          var cc = cliffRow[x] || ' ';
          var hh = (CLIFF_H[cc] !== undefined) ? CLIFF_H[cc] : -1;
          if (hh >= cliffMinH) chars[x] = cc;
        }
      }

      lines[i] = chars.join('');
    }

    pre.textContent = lines.join('\n');
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
