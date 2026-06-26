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
    /* cliff occupies right 38% of viewport; sea rolls freely across left 62% */
    var cliffW = Math.round(tgtCols * 0.38);
    var seaW   = tgtCols - cliffW;

    for (var i = 0; i < tgtRows; i++) {
      /* vertical mapping: cliff row 0 → viewport top, last → viewport bottom */
      var ci   = Math.round(i * (nCliff - 1) / Math.max(1, tgtRows - 1));
      ci       = Math.min(ci, nCliff - 1);
      var crow = CLIFF_ROWS[ci] || '';

      var buf = new Array(tgtCols);
      for (var x = 0; x < tgtCols; x++) {
        if (x < seaW) {
          buf[x] = ' '; /* open sea — wave animation shows through */
        } else {
          /* scale cliff art horizontally into right cliffW columns */
          var cx = Math.round((x - seaW) * CLIFF_MAX_W / cliffW);
          buf[x] = (cx < crow.length) ? crow[cx] : ' ';
        }
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

      /* grand-swell horizontal shift — min 10-char amplitude so even
         horizon rows roll visibly; slow period (~50 s swell, ~25 s shore) */
      var amp1  = 10 + Math.round(progress * 10);
      var amp2  = 5  + Math.round(progress * 7);
      var sh1   = Math.round(Math.sin(time * (0.10 + progress * 0.14) + i * 0.18) * amp1);
      var sh2   = Math.round(Math.sin(time * (0.21 + progress * 0.15) + i * 0.31 + 1.9) * amp2);
      var shift = sh1 + sh2;
      var s     = ((shift % len) + len) % len;
      var shifted = row.slice(s) + row.slice(0, s);

      /* broad brightness rollers — wide spatial crests (2-4 per viewport)
         sweeping slowly so you see bands of light/dark move like real swells */
      var bFreq = 0.030 + progress * 0.035;
      var bSpd  = 0.16  + progress * 0.20;
      var bPhi  = i * 0.14 + progress * 1.9;

      for (var x = 0; x < len; x++) {
        var ch = shifted[x];
        var bi = CHAR_IDX[ch];
        if (bi === undefined) { chars[x] = ch; continue; }

        var wave  = Math.sin(x * bFreq + time * bSpd + bPhi);
        var delta = wave > 0.55 ? 2 : wave > 0.22 ? 1 : wave < -0.55 ? -2 : wave < -0.22 ? -1 : 0;

        var wave2 = Math.sin(x * bFreq * 1.61 + time * bSpd * 0.73 + bPhi * 0.5);
        if (wave2 > 0.48) delta += 1;

        if (progress > 0.55 && wave > 0.55) delta -= 1; /* foreshore foam */

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
