(function () {
  'use strict';

  var SKY_ROWS = 15; // pure-sky rows in the original art

  var pre, ROWS = [], PAD = [], cliffBounds = null;
  var skyPad = 0, seaStart = 0;
  var time = 0, lastTs = 0, animId;

  var WAVE_CHARS = ['.', ':', '-', '=', '+', '*'];
  var CHAR_IDX   = { '.':0, ':':1, '-':2, '=':3, '+':4, '*':5 };

  /* ── init ──────────────────────────────────────────────────────── */
  function init() {
    pre = document.createElement('pre');
    pre.style.cssText = [
      'position:fixed','bottom:0','left:0','right:0',
      'margin:0','padding:0','z-index:-1','pointer-events:none',
      'overflow:hidden','white-space:pre','line-height:1.0',
      'color:#b0b0b0','font-family:"Courier New",Courier,monospace',
      'user-select:none',
      '-webkit-mask-image:linear-gradient(to bottom,transparent 0%,black 16%)',
      'mask-image:linear-gradient(to bottom,transparent 0%,black 16%)'
    ].join(';');
    document.body.insertBefore(pre, document.body.firstChild);

    fetch('/coastal.txt')
      .then(function(r){ return r.text(); })
      .then(function(text){
        ROWS = text.split('\n');
        var maxLen = 0;
        for (var i=0;i<ROWS.length;i++) if (ROWS[i].length>maxLen) maxLen=ROWS[i].length;
        for (var i=0;i<ROWS.length;i++){
          if (ROWS[i].length < maxLen)
            ROWS[i] += new Array(maxLen - ROWS[i].length + 1).join('.');
        }
        resize();
        window.addEventListener('resize', debounce(resize, 180));
        cancelAnimationFrame(animId);
        animId = requestAnimationFrame(loop);
      });
  }

  /* ── resize ────────────────────────────────────────────────────── */
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

    var padded = ROWS.map(function(r){
      if (r.length >= tgtCols) return r;
      return r + new Array(tgtCols - r.length + 1).join('.');
    });

    skyPad = Math.max(0, tgtRows - artRows);
    var skyRow = new Array(tgtCols + 1).join('.');
    PAD = [];
    for (var i=0;i<skyPad;i++) PAD.push(skyRow);
    for (var i=0;i<padded.length;i++) PAD.push(padded[i]);

    seaStart     = skyPad + SKY_ROWS;
    cliffBounds  = buildCliff(PAD.length, tgtCols, skyPad);
  }

  /* ── procedural cliff / mountain silhouette ─────────────────────
     Returns an Int32Array[nRows] where each entry is the column
     at which the cliff face begins (everything to the right = rock). */
  function buildCliff(nRows, nCols, skyPad) {
    var arr = new Int32Array(nRows);
    /* mountain top first appears ~8 rows before the art starts */
    var topRow = Math.max(0, skyPad - 8);

    for (var i = 0; i < nRows; i++) {
      if (i < topRow) { arr[i] = nCols; continue; } /* above mountain: no cliff */

      var t = (i - topRow) / (nRows - topRow); /* 0 = peak, 1 = base */

      /* overall slope: starts narrow at top, widens toward beach */
      var base = 0.86 - t * 0.16;

      /* primary peak (gaussian) */
      var pk1 = 0.18 * Math.exp(-Math.pow((t - 0.17) / 0.085, 2));
      /* secondary shoulder */
      var pk2 = 0.08 * Math.exp(-Math.pow((t - 0.42) / 0.065, 2));
      /* tertiary ledge */
      var pk3 = 0.04 * Math.exp(-Math.pow((t - 0.66) / 0.055, 2));

      /* jagged rock silhouette (several frequencies) */
      var jag = Math.sin(t * 27 + 1.3) * 0.024
              + Math.sin(t * 44 + 3.1) * 0.013
              + Math.sin(t * 73 + 0.7) * 0.006
              + Math.sin(t *121 + 2.0) * 0.003;

      var frac = Math.max(0.52, Math.min(0.97, base - pk1 - pk2 - pk3 + jag));
      arr[i] = Math.round(frac * nCols);
    }
    return arr;
  }

  /* ── per-pixel cliff character ──────────────────────────────────── */
  function cliffChar(row, col, cx) {
    var depth = col - cx;
    /* 2D noise from two overlapping sines */
    var n = Math.sin(row * 0.41 + col * 0.67) + Math.sin(row * 1.27 - col * 0.84);
    if (depth === 0) return n > 0.1 ? '=' : '*';   /* bright edge  */
    if (depth  <  3) return n > 0.5 ? '=' : '#';   /* near-edge    */
    if (depth  <  7) return n > 0.7 ? '*' : '#';   /* mid-face     */
    return '#';                                      /* deep rock    */
  }

  /* ── main render loop ───────────────────────────────────────────── */
  function loop(ts) {
    animId = requestAnimationFrame(loop);
    if (!PAD.length) return;

    var dt = ts - lastTs;
    if (dt > 100) dt = 100;
    lastTs = ts;
    time  += dt * 0.001;

    var nRows = PAD.length;
    var lines = new Array(nRows);

    for (var i = 0; i < nRows; i++) {
      var row = PAD[i];
      var len = row.length;
      var cx  = cliffBounds ? cliffBounds[i] : len;

      /* ── sky rows: static dots + cliff silhouette ── */
      if (i < seaStart) {
        var buf = new Array(len);
        for (var x = 0; x < len; x++)
          buf[x] = x >= cx ? cliffChar(i, x, cx) : '.';
        lines[i] = buf.join('');
        continue;
      }

      /* ── sea rows: waves + cliff overlay ── */
      var progress = (i - seaStart) / (nRows - seaStart); /* 0=horizon 1=shore */

      /* dual-component wave shift for choppiness */
      var amp1  = 2  + Math.round(progress * 13);
      var amp2  = Math.round(1 + progress * 6);
      var spd1  = 0.16 + progress * 0.26;
      var spd2  = 0.34 + progress * 0.21;
      var sh1   = Math.round(Math.sin(time * spd1 + i * 0.21) * amp1);
      var sh2   = Math.round(Math.sin(time * spd2 + i * 0.38 + 1.9) * amp2);
      var shift = sh1 + sh2;
      var s     = ((shift % len) + len) % len;
      var shifted = row.slice(s) + row.slice(0, s);

      /* per-character brightness oscillation parameters */
      var bFreq  = 0.05 + progress * 0.07;
      var bSpd   = 0.30 + progress * 0.40;
      var bPhi   = i * 0.17 + progress * 1.9;
      var chars  = new Array(len);

      for (var x = 0; x < len; x++) {
        /* cliff face */
        if (x >= cx) { chars[x] = cliffChar(i, x, cx); continue; }

        var ch = shifted[x];
        var bi = CHAR_IDX[ch];
        if (bi === undefined) { chars[x] = ch; continue; }

        /* primary oscillation — more aggressive threshold for churn */
        var wave  = Math.sin(x * bFreq + time * bSpd + bPhi);
        var delta = wave > 0.35 ? 1 : wave < -0.35 ? -1 : 0;

        /* secondary counter-wave for extra texture */
        var wave2 = Math.sin(x * bFreq * 1.73 + time * bSpd * 0.61 + bPhi * 0.5);
        if (wave2 > 0.60) delta += 1;

        /* whitecap foam on wave crests near shore */
        if (progress > 0.60 && wave > 0.65) delta -= 1;

        /* splash zone just left of cliff: force lighter chars */
        var distCliff = cx - x;
        if (distCliff >= 0 && distCliff < 8) {
          var splash = Math.sin(time * 2.1 + i * 0.45) * ((8 - distCliff) / 8);
          if (splash > 0.4) delta -= 1;
        }

        chars[x] = WAVE_CHARS[Math.min(5, Math.max(0, bi + delta))];
      }

      lines[i] = chars.join('');
    }

    pre.textContent = lines.join('\n');
  }

  function debounce(fn, ms) {
    var t;
    return function(){ clearTimeout(t); t = setTimeout(fn, ms); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
