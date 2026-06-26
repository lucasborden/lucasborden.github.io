(function () {
  'use strict';

  var SKY_ROWS = 15; // pure-sky rows in the sea art

  var pre;
  var ROWS = [], CLIFF_ROWS = [];
  var PAD = [], CLIFF_PAD = [];
  var CLIFF_MAX_W = 303;
  var skyPad = 0, seaStart = 0;
  var time = 0, lastTs = 0, animId;

  var WAVE_CHARS = ['.', ':', '-', '=', '+', '*'];
  var CHAR_IDX   = { '.':0, ':':1, '-':2, '=':3, '+':4, '*':5 };

  /* ── init ─────────────────────────────────────────────────────── */
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

    /* ── cliff pad: scale cliff art (166 rows × 303 cols) → viewport ── */
    CLIFF_PAD = buildCliffPad(tgtRows, tgtCols);
  }

  function buildCliffPad(tgtRows, tgtCols) {
    var nCliff = CLIFF_ROWS.length;
    var result  = new Array(tgtRows);
    for (var i = 0; i < tgtRows; i++) {
      /* vertical mapping: cliff row 0 → viewport top, last → viewport bottom */
      var ci   = Math.round(i * (nCliff - 1) / Math.max(1, tgtRows - 1));
      ci       = Math.min(ci, nCliff - 1);
      var crow = CLIFF_ROWS[ci] || '';

      /* horizontal mapping: scale 303 → tgtCols */
      var buf = new Array(tgtCols);
      for (var x = 0; x < tgtCols; x++) {
        var cx = Math.round(x * CLIFF_MAX_W / tgtCols);
        buf[x] = (cx < crow.length) ? crow[cx] : ' ';
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

      /* ── sky rows: dots, cliff overlaid ── */
      if (i < seaStart) {
        for (var x = 0; x < len; x++) {
          var cc = cliffRow[x] || ' ';
          chars[x] = (cc !== ' ') ? cc : '.';
        }
        lines[i] = chars.join('');
        continue;
      }

      /* ── sea rows: wave animation ── */
      var progress = (i - seaStart) / (nRows - seaStart); /* 0=horizon 1=shore */

      /* three-component horizontal shift — fast enough to see at 60fps
         period = 2π / (speed * 0.01667 * 60) seconds
         speed 2 → ~3 s/cycle   speed 4 → ~1.6 s   speed 6 → ~1 s        */
      var amp1  = 6  + Math.round(progress * 24); /* up to 30 chars       */
      var amp2  = 3  + Math.round(progress * 14); /* up to 17 chars       */
      var amp3  = Math.round(progress * 8);        /* foreshore chop       */
      var sh1   = Math.round(Math.sin(time * (2.0  + progress * 2.0) + i * 0.21        ) * amp1);
      var sh2   = Math.round(Math.sin(time * (3.8  + progress * 1.6) + i * 0.38 + 1.9  ) * amp2);
      var sh3   = Math.round(Math.sin(time * (6.2  + progress * 2.2) + i * 0.55 + 3.5  ) * amp3);
      var shift = sh1 + sh2 + sh3;
      var s     = ((shift % len) + len) % len;
      var shifted = row.slice(s) + row.slice(0, s);

      /* per-character brightness — fast churn + crashing whitecaps */
      var bFreq  = 0.06 + progress * 0.10;
      var bSpd   = 4.5  + progress * 6.5;   /* was 0.30–0.70, now 4.5–11  */
      var bPhi   = i * 0.17 + progress * 1.9;
      var crash  = Math.sin(time * 2.8 + i * 0.85); /* rolling crest pulse */

      for (var x = 0; x < len; x++) {
        var ch = shifted[x];
        var bi = CHAR_IDX[ch];
        if (bi === undefined) { chars[x] = ch; continue; }

        var wave  = Math.sin(x * bFreq + time * bSpd + bPhi);
        /* ±2 step when wave is strong for punchy contrast */
        var delta = wave > 0.55 ? 2 : wave > 0.18 ? 1 : wave < -0.55 ? -2 : wave < -0.18 ? -1 : 0;

        /* counter-wave texture */
        var wave2 = Math.sin(x * bFreq * 1.73 + time * (bSpd * 0.58) + bPhi * 0.5);
        if (wave2 > 0.50) delta += 1;

        /* breaking whitecap: crest pulse forces lighter (foam) chars */
        if (crash > 0.65 && progress > 0.35) delta -= 2;

        /* deep-foreshore spray: near shore goes very light on each peak */
        if (progress > 0.75 && wave > 0.40) delta -= 1;

        chars[x] = WAVE_CHARS[Math.min(5, Math.max(0, bi + delta))];
      }

      /* cliff overlay: any non-space cliff char wins over sea */
      for (var x = 0; x < len; x++) {
        var cc = cliffRow[x] || ' ';
        if (cc !== ' ') chars[x] = cc;
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
