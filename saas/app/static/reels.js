// Scheda Reel: anima su canvas le scene JSON generate dall'AI (schemas.ReelSet).
// Il JSON sta in un <script type="application/json"> (non eseguito); il testo va solo in fillText, mai nel DOM come HTML.
(function () {
  var W = 360, H = 640, TOP = 100, BOTTOM = 500; // tela logica 9:16, area degli elementi tra titolo e sottotitolo
  var STAGGER = 0.45, APPEAR = 0.6;
  var FONT = "system-ui, -apple-system, Segoe UI, sans-serif";
  var SIZES = { s: 14, m: 18, l: 26 };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp(v) { return Math.max(0, Math.min(1, v)); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function backOut(t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  // Colori del tema daisyUI corrente: letti a ogni fotogramma, così il cambio tema vale subito.
  function palette() {
    var css = getComputedStyle(document.documentElement);
    var get = function (n) { return css.getPropertyValue("--color-" + n).trim() || "#888"; };
    return {
      bg: get("base-200"), text: get("base-content"), neutral: get("base-content"),
      primary: get("primary"), secondary: get("secondary"), accent: get("accent"),
      success: get("success"), warning: get("warning"), error: get("error"),
    };
  }

  function wrap(ctx, text, maxWidth) {
    var lines = [], line = "";
    String(text).split(/\s+/).forEach(function (word) {
      var next = line ? line + " " + word : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else { line = next; }
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawLines(ctx, lines, x, y, lineHeight) {
    var y0 = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach(function (l, i) { ctx.fillText(l, x, y0 + i * lineHeight); });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }

  function px(x) { return 24 + (x / 100) * (W - 48); }
  function py(y) { return TOP + (y / 100) * (BOTTOM - TOP); }

  // Misure dei box, servono anche alle frecce.
  function layoutBoxes(ctx, scene) {
    var boxes = {};
    ctx.font = "600 15px " + FONT;
    scene.elements.forEach(function (el) {
      if (el.type !== "box") return;
      var lines = wrap(ctx, el.label, 120);
      var w = Math.max.apply(null, lines.map(function (l) { return ctx.measureText(l).width; })) + 24;
      boxes[el.id] = { x: px(el.x), y: py(el.y), w: w, h: lines.length * 19 + 18, lines: lines };
    });
    return boxes;
  }

  // Punto in cui il segmento dal centro di b verso (tx, ty) esce dal box.
  function edge(b, tx, ty) {
    var dx = tx - b.x, dy = ty - b.y;
    var s = Math.min((b.w / 2 + 6) / Math.abs(dx || 1e-6), (b.h / 2 + 6) / Math.abs(dy || 1e-6));
    return { x: b.x + dx * s, y: b.y + dy * s };
  }

  function drawElement(ctx, el, p, boxes, c) {
    var col = c[el.color] || c.primary;
    ctx.save();
    if (el.type === "text") {
      var size = SIZES[el.size] || SIZES.m;
      ctx.globalAlpha *= p;
      ctx.fillStyle = el.color && el.color !== "neutral" ? col : c.text;
      ctx.font = (el.size === "l" ? "800 " : "600 ") + size + "px " + FONT;
      drawLines(ctx, wrap(ctx, el.text, W - 56), px(el.x), py(el.y) + (1 - easeOut(p)) * 16, size * 1.25);
    } else if (el.type === "box") {
      var b = boxes[el.id], k = backOut(p);
      ctx.globalAlpha *= clamp(p * 2);
      ctx.translate(b.x, b.y);
      ctx.scale(k, k);
      roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 12);
      var a = ctx.globalAlpha;
      ctx.globalAlpha = a * 0.18; ctx.fillStyle = col; ctx.fill();
      ctx.globalAlpha = a; ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
      ctx.fillStyle = c.text; ctx.font = "600 15px " + FONT;
      drawLines(ctx, b.lines, 0, 0, 19);
    } else if (el.type === "arrow") {
      var from = boxes[el.start], to = boxes[el.end];
      if (from && to && from !== to) {
        var s = edge(from, to.x, to.y), e = edge(to, from.x, from.y), q = easeOut(p);
        var ex = s.x + (e.x - s.x) * q, ey = s.y + (e.y - s.y) * q, ang = Math.atan2(e.y - s.y, e.x - s.x);
        ctx.strokeStyle = ctx.fillStyle = c.text; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(ex, ey); ctx.stroke();
        if (q > 0.85) {
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - 10 * Math.cos(ang - 0.45), ey - 10 * Math.sin(ang - 0.45));
          ctx.lineTo(ex - 10 * Math.cos(ang + 0.45), ey - 10 * Math.sin(ang + 0.45));
          ctx.fill();
        }
        if (el.label && q > 0.5) {
          // Etichetta spostata di lato rispetto alla freccia (verso l'alto), così non la copre.
          var nx = -Math.sin(ang), ny = Math.cos(ang);
          if (ny > 0) { nx = -nx; ny = -ny; }
          var mx = (s.x + e.x) / 2 + nx * 14, my = (s.y + e.y) / 2 + ny * 14;
          ctx.font = "500 12px " + FONT;
          var lw = ctx.measureText(el.label).width + 10;
          ctx.globalAlpha *= clamp((q - 0.5) * 2);
          ctx.fillStyle = c.bg; ctx.fillRect(mx - lw / 2, my - 9, lw, 18);
          ctx.fillStyle = c.text; ctx.fillText(el.label, mx, my);
        }
      }
    } else if (el.type === "bars") {
      var n = el.items.length, left = 48, right = W - 48, base = BOTTOM - 50, top = TOP + 50;
      var max = Math.max.apply(null, el.items.map(function (i) { return i.value; })) || 1;
      var slot = (right - left) / n, bw = Math.min(slot * 0.6, 60);
      ctx.font = "600 13px " + FONT;
      el.items.forEach(function (item, j) {
        var pb = easeOut(clamp(p * 1.6 - j * 0.15)), h = (item.value / max) * (base - top) * pb, x = left + slot * j + slot / 2;
        ctx.fillStyle = col; roundRect(ctx, x - bw / 2, base - h, bw, h, 6); ctx.fill();
        ctx.fillStyle = c.text; ctx.globalAlpha = clamp(pb * 2);
        ctx.fillText(String(Math.round(item.value * pb * 100) / 100), x, base - h - 12);
        drawLines(ctx, wrap(ctx, item.label, slot - 6), x, base + 20, 15);
        ctx.globalAlpha = 1;
      });
    }
    ctx.restore();
  }

  function Player(article) {
    var canvas = article.querySelector("canvas");
    var ctx = canvas.getContext("2d");
    var reel = JSON.parse(article.querySelector('script[type="application/json"]').textContent);
    var scene = 0, t = 0, playing = false, paused = false, last = null, frame = null;

    function draw() {
      var c = palette(), sc = reel.scenes[scene], boxes = layoutBoxes(ctx, sc);
      // Scala uniforme e centrata: se max-w-full stringe il canvas, la scena non si deforma.
      var k = Math.min(canvas.width / W, canvas.height / H);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = c.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, (canvas.width - W * k) / 2, (canvas.height - H * k) / 2);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";

      // Barre di avanzamento delle scene, come le storie.
      var gap = 4, seg = (W - 32 - gap * (reel.scenes.length - 1)) / reel.scenes.length;
      reel.scenes.forEach(function (s, i) {
        var fill = i < scene ? 1 : i > scene ? 0 : clamp(t / s.seconds);
        ctx.globalAlpha = 0.3; ctx.fillStyle = c.text; ctx.fillRect(16 + i * (seg + gap), 14, seg, 3);
        ctx.globalAlpha = 1; ctx.fillRect(16 + i * (seg + gap), 14, seg * fill, 3);
      });

      ctx.fillStyle = c.text; ctx.font = "800 19px " + FONT;
      drawLines(ctx, wrap(ctx, reel.title, W - 40).slice(0, 2), W / 2, 54, 24);

      ctx.globalAlpha = reduced ? 1 : clamp(t / 0.3);
      sc.elements.forEach(function (el, i) {
        drawElement(ctx, el, reduced ? 1 : clamp((t - 0.3 - i * STAGGER) / APPEAR), boxes, c);
      });

      ctx.globalAlpha = reduced ? 1 : clamp((t - 0.2) / 0.4);
      ctx.fillStyle = c.text; ctx.font = "500 15px " + FONT;
      drawLines(ctx, wrap(ctx, sc.caption, W - 48).slice(0, 5), W / 2, 570, 20);

      if (paused) {
        ctx.globalAlpha = 0.7; ctx.fillStyle = c.text;
        roundRect(ctx, W / 2 - 16, H / 2 - 22, 10, 44, 3); ctx.fill();
        roundRect(ctx, W / 2 + 6, H / 2 - 22, 10, 44, 3); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function tick(now) {
      frame = null;
      if (last !== null && !paused) t += (now - last) / 1000;
      last = now;
      if (t >= reel.scenes[scene].seconds) go(scene + 1);
      draw();
      if (playing && !paused) frame = requestAnimationFrame(tick);
    }

    function go(i) {
      scene = (i + reel.scenes.length) % reel.scenes.length; // dopo l'ultima scena il reel ricomincia
      t = 0;
    }

    function resume() {
      if (frame === null) { last = null; frame = requestAnimationFrame(tick); }
    }

    function resize() {
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      draw();
    }

    function control(action) {
      if (action === "toggle") paused = !paused;
      else { go(scene + (action === "next" ? 1 : -1)); }
      resume();
    }

    canvas.addEventListener("click", function (e) {
      var x = (e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth;
      control(x < 1 / 3 ? "prev" : x > 2 / 3 ? "next" : "toggle");
    });
    article.addEventListener("keydown", function (e) {
      var action = { ArrowLeft: "prev", ArrowRight: "next", " ": "toggle" }[e.key];
      if (action) { e.preventDefault(); control(action); }
    });
    new ResizeObserver(resize).observe(canvas);

    return {
      play: function () { playing = true; resume(); },
      stop: function () { playing = false; },
    };
  }

  document.querySelectorAll("[data-reel-feed]").forEach(function (feed) {
    var players = new Map();
    feed.querySelectorAll("[data-reel]").forEach(function (a) { players.set(a, Player(a)); });
    // Parte solo il reel visibile, come nel feed di Instagram.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { players.get(e.target)[e.isIntersecting ? "play" : "stop"](); });
    }, { root: feed, threshold: 0.6 });
    players.forEach(function (_, a) { io.observe(a); });
  });
})();
