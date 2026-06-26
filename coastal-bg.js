(function () {
  'use strict';

  /* rows of the art that are pure sky (no wave chars) */
  const SKY_ROWS = 15;

  let pre, ROWS = [];
  let time = 0, lastTs = 0;
  let animId;

  function init() {
    pre = document.createElement('pre');
    pre.style.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0',
      'margin:0', 'padding:0', 'z-index:-1', 'pointer-events:none',
      'overflow:hidden', 'white-space:pre', 'line-height:1.0',
      'color:#b8b8b8', 'font-family:"Courier New",Courier,monospace',
      'user-select:none',
      /* fade the top rows into the white background */
      '-webkit-mask-image:linear-gradient(to bottom,transparent 0%,black 22%)',
      'mask-image:linear-gradient(to bottom,transparent 0%,black 22%)'
    ].join(';');
    document.body.insertBefore(pre, document.body.firstChild);

    fetch('/coastal.txt')
      .then(function (r) { return r.text(); })
      .then(function (text) {
        ROWS = text.split('\n');
        /* pad all rows to the same length so circular shift looks clean */
        var maxLen = 0;
        for (var i = 0; i < ROWS.length; i++) {
          if (ROWS[i].length > maxLen) maxLen = ROWS[i].length;
        }
        for (var i = 0; i < ROWS.length; i++) {
          while (ROWS[i].length < maxLen) ROWS[i] += '.';
        }
        resize();
        window.addEventListener('resize', debounce(resize, 180));
        cancelAnimationFrame(animId);
        animId = requestAnimationFrame(loop);
      });
  }

  function resize() {
    if (!ROWS.length) return;
    var cols = ROWS[0].length;
    var rows = ROWS.length;
    /* Scale so the full art (all rows × all cols) fits the viewport,
       then pull back to 72% so the scene reads as a picture, not chars */
    var fsW = window.innerWidth  / (cols * 0.601);
    var fsH = window.innerHeight / rows;
    var fs  = Math.min(fsW, fsH) * 0.72;
    pre.style.fontSize = fs + 'px';
  }

  /* wave characters ordered light → dark */
  var WAVE_CHARS = ['.', ':', '-', '=', '+', '*'];
  var WAVE_SET   = new Set(WAVE_CHARS);

  function loop(ts) {
    animId = requestAnimationFrame(loop);
    if (!ROWS.length) return;

    var dt = ts - lastTs;
    if (dt > 100) dt = 100;
    lastTs = ts;
    time  += dt * 0.001;

    var nRows = ROWS.length;
    var lines = [];

    for (var i = 0; i < nRows; i++) {
      var row = ROWS[i];

      if (i < SKY_ROWS) {
        lines.push(row);
        continue;
      }

      /* sea row: circular horizontal shift + character-level brightness wave */
      var progress = (i - SKY_ROWS) / (nRows - SKY_ROWS); /* 0=horizon, 1=shore */
      var shiftAmp  = 1 + Math.round(progress * 7);
      var shiftSpd  = 0.14 + progress * 0.28;
      var shiftPhi  = i * 0.21;
      var shift     = Math.round(Math.sin(time * shiftSpd + shiftPhi) * shiftAmp);

      var len = row.length;
      var s   = ((shift % len) + len) % len;
      var shifted = row.slice(s) + row.slice(0, s);

      /* optional: brighten/darken each wave char based on a secondary sine */
      var out = '';
      var brightFreq = 0.04 + progress * 0.06;
      var brightSpd  = 0.22 + progress * 0.30;
      var brightPhi2 = i * 0.17;

      for (var x = 0; x < shifted.length; x++) {
        var ch = shifted[x];
        if (!WAVE_SET.has(ch)) { out += ch; continue; }

        var baseIdx = WAVE_CHARS.indexOf(ch);
        var wave    = Math.sin(x * brightFreq + time * brightSpd + brightPhi2 + progress * 1.6);
        var delta   = wave > 0.55 ? 1 : wave < -0.55 ? -1 : 0;
        var newIdx  = Math.min(5, Math.max(0, baseIdx + delta));
        out += WAVE_CHARS[newIdx];
      }

      lines.push(out);
    }

    pre.textContent = lines.join('\n');
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
