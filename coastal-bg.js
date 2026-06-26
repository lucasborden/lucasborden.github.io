(function () {
  'use strict';

  /* sky rows in the original art (pure dots, no wave animation) */
  var SKY_ROWS = 15;

  var pre, ROWS = [], PAD = [], skyPad = 0;
  var time = 0, lastTs = 0, animId;

  /* fast char→index lookup (avoids indexOf in hot loop) */
  var WAVE_CHARS = ['.', ':', '-', '=', '+', '*'];
  var CHAR_IDX   = { '.': 0, ':': 1, '-': 2, '=': 3, '+': 4, '*': 5 };

  function init() {
    pre = document.createElement('pre');
    pre.style.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0',
      'margin:0', 'padding:0', 'z-index:-1', 'pointer-events:none',
      'overflow:hidden', 'white-space:pre', 'line-height:1.0',
      'color:#b8b8b8', 'font-family:"Courier New",Courier,monospace',
      'user-select:none',
      '-webkit-mask-image:linear-gradient(to bottom,transparent 0%,black 18%)',
      'mask-image:linear-gradient(to bottom,transparent 0%,black 18%)'
    ].join(';');
    document.body.insertBefore(pre, document.body.firstChild);

    fetch('/coastal.txt')
      .then(function (r) { return r.text(); })
      .then(function (text) {
        ROWS = text.split('\n');
        /* normalise all rows to the same width */
        var maxLen = 0;
        for (var i = 0; i < ROWS.length; i++) {
          if (ROWS[i].length > maxLen) maxLen = ROWS[i].length;
        }
        for (var i = 0; i < ROWS.length; i++) {
          if (ROWS[i].length < maxLen) ROWS[i] += new Array(maxLen - ROWS[i].length + 1).join('.');
        }
        resize();
        window.addEventListener('resize', debounce(resize, 180));
        cancelAnimationFrame(animId);
        animId = requestAnimationFrame(loop);
      });
  }

  function resize() {
    if (!ROWS.length) return;

    var artCols = ROWS[0].length;
    var artRows = ROWS.length;

    /* Font size: fit the full picture in the viewport then pull back a touch */
    var fsW = window.innerWidth  / (artCols * 0.601);
    var fsH = window.innerHeight / artRows;
    var fs  = Math.min(fsW, fsH) * 0.72;
    pre.style.fontSize = fs + 'px';

    /* How many chars / rows fill the viewport at this size */
    var charW   = fs * 0.601;
    var tgtCols = Math.ceil(window.innerWidth  / charW) + 2;
    var tgtRows = Math.ceil(window.innerHeight / fs)    + 2;

    /* Pad each art row rightward with dots to reach tgtCols */
    var dotFill = new Array(Math.max(0, tgtCols - artCols) + 1).join('.');
    var padded  = ROWS.map(function (r) {
      return r.length < tgtCols ? r + dotFill.slice(0, tgtCols - r.length) : r;
    });

    /* Prepend blank sky rows so the art stretches up to fill tgtRows */
    skyPad = Math.max(0, tgtRows - artRows);
    var skyRow = new Array(tgtCols + 1).join('.');
    PAD = [];
    for (var i = 0; i < skyPad; i++) PAD.push(skyRow);
    for (var i = 0; i < padded.length; i++) PAD.push(padded[i]);
  }

  function loop(ts) {
    animId = requestAnimationFrame(loop);
    if (!PAD.length) return;

    var dt = ts - lastTs;
    if (dt > 100) dt = 100;
    lastTs = ts;
    time  += dt * 0.001;

    var nRows    = PAD.length;
    var seaStart = skyPad + SKY_ROWS;
    var lines    = new Array(nRows);

    for (var i = 0; i < nRows; i++) {
      var row = PAD[i];

      /* sky / horizon rows — static */
      if (i < seaStart) { lines[i] = row; continue; }

      var progress   = (i - seaStart) / (nRows - seaStart); /* 0=horizon 1=shore */
      var shiftAmp   = 1 + Math.round(progress * 7);
      var shiftSpd   = 0.14 + progress * 0.28;
      var shift      = Math.round(Math.sin(time * shiftSpd + i * 0.21) * shiftAmp);
      var len        = row.length;
      var s          = ((shift % len) + len) % len;
      var shifted    = row.slice(s) + row.slice(0, s);

      /* per-character brightness oscillation */
      var brightFreq = 0.04 + progress * 0.06;
      var brightSpd  = 0.22 + progress * 0.30;
      var brightPhi  = i * 0.17 + progress * 1.6;
      var chars      = new Array(len);

      for (var x = 0; x < len; x++) {
        var ch = shifted[x];
        var bi = CHAR_IDX[ch];
        if (bi === undefined) { chars[x] = ch; continue; }
        var wave  = Math.sin(x * brightFreq + time * brightSpd + brightPhi);
        var delta = wave > 0.55 ? 1 : wave < -0.55 ? -1 : 0;
        chars[x]  = WAVE_CHARS[Math.min(5, Math.max(0, bi + delta))];
      }

      lines[i] = chars.join('');
    }

    pre.textContent = lines.join('\n');
  }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
