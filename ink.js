/* ============================================================
   ink.js — чернильный слой для страницы
   Подключение:  <script src="ink.js"></script>
   Даёт:
     window.checkAndLoadSite(targetUrl, checkPath)  — проверка + переход
     window.inkAlert({title, message, code, kicker, actions}) — окно вместо alert
     window.Ink.splatter(x, y, n) / .drain() / .getLevel() / .gameOver()
   Всё (стили, разметку окна, canvas) создаёт сам, ничего в HTML не нужно.
   ============================================================ */
(function () {
  "use strict";

  var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FINE = matchMedia("(pointer: fine)").matches;

  /* ---------- настройки ---------- */
  var CFG = {
    dropVolume: 0.0019,   // сколько уровня добавляет одна капля радиусом 5
    penDripRate: 0.8,     // базовая частота капель с пера
    wallDrips: true,      // потёки по верхнему краю экрана
    tendrils: true,       // языки чернил, поднимающиеся из лужи
    corners: true,        // чернила, наползающие из углов
    trail: true,          // мазок за курсором
    gameOverAt: 0.999
  };

  /* ============================================================
     1. СТИЛИ
     ============================================================ */
  var CSS = `
  .ink-canvas{position:fixed;inset:0;z-index:9999;pointer-events:none}
  html.ink-cursor,html.ink-cursor *{cursor:none!important}
  html.ink-shake{animation:ink-shake .5s linear}
  @keyframes ink-shake{
    0%,100%{transform:translate(0,0)}
    20%{transform:translate(-6px,4px)}40%{transform:translate(5px,-5px)}
    60%{transform:translate(-4px,-3px)}80%{transform:translate(4px,4px)}
  }

  /* --- обводка, которая прорисовывается при наведении --- */
  .ink-ol{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:2}
  .ink-ol rect{
    x:1px;y:1px;width:calc(100% - 2px);height:calc(100% - 2px);rx:3px;
    fill:none;stroke:#c92a2e;stroke-width:2;stroke-dasharray:100;stroke-dashoffset:100;opacity:0;
    transition:stroke-dashoffset .6s cubic-bezier(.65,0,.35,1),opacity .3s ease;
    filter:drop-shadow(0 0 6px rgba(201,42,46,.55));
  }
  .ink-host{position:relative;isolation:isolate;overflow:hidden;
    transition:transform .12s cubic-bezier(.2,.8,.3,1),filter .3s ease}
  .ink-host:hover > .ink-ol rect,.ink-host:focus-visible > .ink-ol rect{stroke-dashoffset:0;opacity:1}
  .ink-host:active{transform:scale(.965)}

  /* --- рябь по клику --- */
  .ink-ripple{position:absolute;border-radius:50%;pointer-events:none;z-index:1;
    background:radial-gradient(circle,rgba(201,42,46,.5) 0%,rgba(201,42,46,.18) 45%,transparent 70%);
    transform:translate(-50%,-50%) scale(0);animation:ink-ripple .62s cubic-bezier(.2,.75,.3,1) forwards}
  @keyframes ink-ripple{to{transform:translate(-50%,-50%) scale(1);opacity:0}}

  /* --- окно вместо alert --- */
  .ink-overlay{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;
    padding:calc(16px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px))
            calc(16px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));
    font-family:"Alice",Georgia,serif;color:#ddd2bb}
  .ink-overlay[hidden]{display:none!important}
  .ink-overlay-bg{position:absolute;inset:0;background:rgba(5,4,4,.82);animation:ink-bgin .45s ease forwards}
  @keyframes ink-bgin{from{opacity:0;backdrop-filter:blur(0)}to{opacity:1;backdrop-filter:blur(3px)}}
  .ink-sheet{position:relative;width:min(560px,100%);
    background:linear-gradient(180deg,#171413,#0e0c0b);border:1px solid #332b29;
    padding:30px 26px 24px;box-shadow:0 50px 90px -40px #000;
    animation:ink-sheetin .5s cubic-bezier(.2,.9,.25,1) forwards}
  @keyframes ink-sheetin{from{opacity:0;transform:translateY(22px) scale(.94)}to{opacity:1;transform:none}}
  .ink-sheet::before{content:"";position:absolute;left:-1px;right:-1px;top:-1px;height:4px;
    background:linear-gradient(90deg,#8e1316,#c92a2e,#3a0d0e)}
  .ink-blot{position:absolute;left:50%;top:-34px;transform:translateX(-50%);width:160px;height:64px;pointer-events:none}
  .ink-kicker{font-family:"Roboto Mono",ui-monospace,monospace;font-size:10px;letter-spacing:.22em;
    text-transform:uppercase;color:#c92a2e;margin:0}
  .ink-sheet h2{font-family:"Kelly Slab",Georgia,serif;font-weight:400;font-size:clamp(24px,5vw,32px);
    margin:6px 0 0;line-height:1.1;text-wrap:balance;color:#efe4d2}
  .ink-msg{margin:14px 0 0;color:#9b9079;line-height:1.65;font-size:15px}
  .ink-code{display:block;margin-top:14px;padding:11px 12px;background:#0a0908;border:1px solid #2a2422;
    font-family:"Roboto Mono",ui-monospace,monospace;font-size:12px;color:#c8bca4;word-break:break-all}
  .ink-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
  .ink-btn{position:relative;isolation:isolate;overflow:hidden;cursor:pointer;
    font-family:"Roboto Mono",ui-monospace,monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;
    padding:13px 20px;border:1px solid #352d2b;background:transparent;color:#ddd2bb;
    transition:transform .12s cubic-bezier(.2,.8,.3,1),background .3s ease,color .3s ease}
  .ink-btn:hover{background:#1f1a18;color:#fff}
  .ink-btn:active{transform:scale(.965)}
  .ink-btn--primary{background:linear-gradient(180deg,#9c1619,#6f0f12);border-color:#b2272b;color:#f6ece0;
    box-shadow:0 10px 26px -14px rgba(201,42,46,.9)}
  .ink-btn--primary:hover{background:linear-gradient(180deg,#b81c20,#840f13)}
  .ink-btn:focus-visible{outline:none}

  /* --- game over --- */
  .ink-gameover{position:fixed;inset:0;z-index:10001;display:grid;place-items:center;background:#000;
    padding:0 max(16px,env(safe-area-inset-left,0px));text-align:center;font-family:"Alice",Georgia,serif}
  .ink-gameover[hidden]{display:none!important}
  .ink-go-inner{display:flex;flex-direction:column;align-items:center;gap:8px;
    animation:ink-gofade 1.6s ease forwards}
  @keyframes ink-gofade{from{opacity:0;filter:blur(16px);transform:scale(1.15)}to{opacity:1;filter:blur(0);transform:none}}
  .ink-go-inner h2{font-family:"Kelly Slab",Georgia,serif;font-weight:400;margin:0;
    font-size:clamp(44px,13vw,110px);letter-spacing:.04em;line-height:.95;color:#efe4d2;
    text-shadow:0 0 46px rgba(201,42,46,.5),0 4px 0 #3a0d0e}
  .ink-go-inner .ink-sub{font-family:"Roboto Mono",ui-monospace,monospace;font-size:12px;letter-spacing:.24em;
    text-transform:uppercase;color:#c92a2e;margin:0}
  .ink-go-inner .ink-note{color:#7a6e5b;margin:4px 0 14px;font-size:14px}
  @media (prefers-reduced-motion:reduce){
    .ink-overlay *,.ink-gameover *{animation-duration:.01ms!important;transition-duration:.01ms!important}
  }`;

  var styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* шрифты (если их нет на странице — не обязательно) */
  if (!document.querySelector('link[href*="Kelly+Slab"]')) {
    var f = document.createElement("link");
    f.rel = "stylesheet";
    f.href = "https://fonts.googleapis.com/css2?family=Kelly+Slab&family=Alice&family=Roboto+Mono:wght@400;500&display=swap";
    document.head.appendChild(f);
  }

  /* ============================================================
     2. РАЗМЕТКА (canvas, окно, game over)
     ============================================================ */
  var cv = document.createElement("canvas");
  cv.className = "ink-canvas";
  cv.setAttribute("aria-hidden", "true");

  var modal = document.createElement("div");
  modal.className = "ink-overlay";
  modal.hidden = true;
  modal.innerHTML =
    '<div class="ink-overlay-bg"></div>' +
    '<div class="ink-sheet" role="dialog" aria-modal="true" aria-labelledby="ink-title">' +
      '<svg class="ink-blot" viewBox="0 0 160 64" aria-hidden="true">' +
        '<path fill="#8e1316" opacity=".55" d="M18 34c-6-10 2-22 14-20 6-8 20-10 27-3 9-7 23-4 27 6 11-3 22 4 22 14 0 9-7 15-16 16-6 7-17 9-25 4-8 6-20 5-27-2-9 2-18-4-22-15z"/>' +
        '<path fill="#0a0908" d="M24 32c-5-8 1-18 11-16 5-6 16-8 22-2 7-6 19-3 22 5 9-2 18 3 18 11 0 8-6 13-13 13-5 6-14 8-20 3-7 5-17 4-22-2-8 2-15-4-18-12z"/>' +
      '</svg>' +
      '<p class="ink-kicker"></p><h2 id="ink-title"></h2>' +
      '<p class="ink-msg"></p><code class="ink-code"></code>' +
      '<div class="ink-actions"></div>' +
    '</div>';

  var goEl = document.createElement("div");
  goEl.className = "ink-gameover";
  goEl.hidden = true;
  goEl.innerHTML =
    '<div class="ink-go-inner">' +
      '<p class="ink-sub">Чернила поглотили страницу</p>' +
      '<h2>GAME OVER</h2>' +
      '<p class="ink-note">Перо опустело только потому, что всё вытекло наружу.</p>' +
      '<button class="ink-btn ink-btn--primary ink-host" data-ink-restart>Начать заново</button>' +
    '</div>';

  function mount() {
    document.body.appendChild(cv);
    document.body.appendChild(modal);
    document.body.appendChild(goEl);
    resize();
    scanOutlines();
    requestAnimationFrame(frame);
  }

  /* ============================================================
     3. ОБВОДКА И РЯБЬ
     ============================================================ */
  var NS = "http://www.w3.org/2000/svg";
  function addOutline(el) {
    if (el.querySelector(":scope > .ink-ol")) return;
    el.classList.add("ink-host");
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "ink-ol");
    svg.setAttribute("aria-hidden", "true");
    var r = document.createElementNS(NS, "rect");
    r.setAttribute("pathLength", "100");
    svg.appendChild(r);
    el.appendChild(svg);
  }
  function scanOutlines(root) {
    (root || document).querySelectorAll("button, .ink-btn, [data-ink]").forEach(addOutline);
  }
  window.addEventListener("load", function () { scanOutlines(); });

  document.addEventListener("pointerdown", function (e) {
    var host = e.target.closest(".ink-host, button, .ink-btn");
    if (host) {
      var rect = host.getBoundingClientRect();
      var sp = document.createElement("span");
      sp.className = "ink-ripple";
      var size = Math.max(rect.width, rect.height) * 2.4;
      sp.style.width = sp.style.height = size + "px";
      sp.style.left = (e.clientX - rect.left) + "px";
      sp.style.top = (e.clientY - rect.top) + "px";
      host.appendChild(sp);
      setTimeout(function () { sp.remove(); }, 660);
    }
    splatter(e.clientX, e.clientY, host ? 14 : 9);
  });

  /* ============================================================
     4. ЧЕРНИЛА
     ============================================================ */
  var ctx = cv.getContext("2d");
  var W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener("resize", resize);

  var drops = [], stains = [], ripples = [], walls = [], tendrils = [], trail = [];
  var level = 0, draining = false, over = false, T = 0, bead = 0, beadR = 0;
  var P = { x: innerWidth / 2, y: innerHeight / 3, lx: innerWidth / 2, ly: innerHeight / 3, inside: FINE, tilt: 0 };

  if (FINE) document.documentElement.classList.add("ink-cursor");

  addEventListener("pointermove", function (e) {
    P.x = e.clientX; P.y = e.clientY; P.inside = true;
    if (e.pointerType !== "mouse") splatter(e.clientX, e.clientY, 2);
  }, { passive: true });
  addEventListener("pointerleave", function () { P.inside = false; });
  addEventListener("blur", function () { P.inside = false; });

  function surfaceY(x) {
    var y = H - level * H
      + Math.sin(x * 0.011 + T * 1.5) * 3.0
      + Math.sin(x * 0.026 - T * 2.4) * 1.8
      + Math.sin(x * 0.004 + T * 0.7) * 2.4;
    for (var i = 0; i < ripples.length; i++) {
      var r = ripples[i], d = x - r.x;
      y -= r.a * Math.exp(-(d * d) / (2 * r.w * r.w)) * Math.cos(d * 0.055 - r.t * 8);
    }
    return y;
  }

  function addDrop(x, y, r, vx, vy) {
    if (drops.length > 280) return;
    drops.push({ x: x, y: y, r: r, vx: vx || 0, vy: vy || 0 });
  }

  function splatter(x, y, n) {
    if (over) return;
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 60 + Math.random() * 260;
      addDrop(x, y, 1.6 + Math.random() * 3.4, Math.cos(a) * sp, Math.sin(a) * sp * 0.75);
    }
    stains.push({
      x: x, y: y, r: 7 + Math.random() * 9, streak: 0, max: 30 + Math.random() * 120,
      lobes: Array.from({ length: 6 }, function () {
        return { a: Math.random() * 6.28, d: Math.random(), s: 0.4 + Math.random() * 0.7 };
      })
    });
    if (stains.length > 18) stains.shift();
    ripples.push({ x: x, a: 4, w: 40, t: 0 });
  }

  function land(d) {
    level = Math.min(1, level + CFG.dropVolume * Math.pow(d.r / 5, 2));
    ripples.push({ x: d.x, a: Math.min(9, 2 + d.r * 0.9), w: 26 + d.r * 5, t: 0 });
    if (ripples.length > 14) ripples.shift();
    for (var i = 0; i < (d.r > 3 ? 3 : 2); i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      addDrop(d.x, d.y - 2, 0.9 + Math.random() * 1.5,
        Math.cos(a) * (40 + Math.random() * 90), Math.sin(a) * (60 + Math.random() * 120));
    }
    if (CFG.tendrils && Math.random() < 0.18 && tendrils.length < 7) {
      tendrils.push({ x: d.x, h: 0, max: 20 + Math.random() * 55, w: 7 + Math.random() * 9, t: 0, up: true });
    }
  }

  /* ---------- отрисовка ---------- */
  function drawDrop(d) {
    var st = Math.min(2.6, 1 + Math.abs(d.vy) * 0.0035);
    var ang = Math.atan2(d.vy, d.vx) - Math.PI / 2;
    var r = d.r, h = r * 1.5 * st;
    ctx.save();
    ctx.translate(d.x, d.y);
    if (Math.abs(d.vx) > 6) ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.bezierCurveTo(r * .85, -h * .42, r, -r * .35, r, 0);
    ctx.arc(0, 0, r, 0, Math.PI);
    ctx.bezierCurveTo(-r, -r * .35, -r * .85, -h * .42, 0, -h);
    ctx.closePath();
    var g = ctx.createLinearGradient(-r, -r * 2, r, r);
    g.addColorStop(0, "#1d1a19"); g.addColorStop(.45, "#0b0a09"); g.addColorStop(1, "#000");
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-r * .32, -r * .3, r * .26, r * .4, -.5, 0, 6.3);
    ctx.fillStyle = "rgba(228,216,194,.30)"; ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * .3, r * .25, r * .3, r * .22, .4, 0, 6.3);
    ctx.fillStyle = "rgba(170,28,32,.35)"; ctx.fill();
    ctx.restore();
  }

  function drawStain(s) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.fillStyle = "#070606";
    ctx.beginPath();
    for (var i = 0; i < s.lobes.length; i++) {
      var l = s.lobes[i], cx = Math.cos(l.a) * l.d * s.r, cy = Math.sin(l.a) * l.d * s.r;
      ctx.moveTo(cx + s.r * l.s, cy);
      ctx.arc(cx, cy, s.r * l.s, 0, 6.3);
    }
    ctx.moveTo(s.r * .95, 0); ctx.arc(0, 0, s.r * .95, 0, 6.3);
    ctx.fill();
    if (s.streak > 1) {
      ctx.beginPath();
      ctx.moveTo(-s.r * .3, 0);
      ctx.quadraticCurveTo(0, s.streak * .6, 0, s.streak);
      ctx.quadraticCurveTo(0, s.streak * .6, s.r * .3, 0);
      ctx.fill();
      ctx.beginPath(); ctx.arc(0, s.streak, 2.4, 0, 6.3); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(-s.r * .25, -s.r * .3, s.r * .22, 0, 6.3);
    ctx.fillStyle = "rgba(216,200,170,.10)"; ctx.fill();
    ctx.restore();
  }

  function drawWall(w) {
    ctx.save(); ctx.translate(w.x, 0); ctx.fillStyle = "#070606";
    ctx.beginPath();
    ctx.moveTo(-w.w, 0);
    ctx.quadraticCurveTo(-w.w * .5, w.len * .7, 0, w.len);
    ctx.quadraticCurveTo(w.w * .5, w.len * .7, w.w, 0);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, w.len, w.w * .55, 0, 6.3); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-w.w * .35, 2);
    ctx.quadraticCurveTo(-w.w * .2, w.len * .6, 0, w.len * .85);
    ctx.strokeStyle = "rgba(226,214,190,.10)"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }

  function drawTendril(t) {
    var base = surfaceY(t.x);
    ctx.save(); ctx.fillStyle = "#050404";
    ctx.beginPath();
    ctx.moveTo(t.x - t.w, base + 4);
    ctx.bezierCurveTo(t.x - t.w * .7, base - t.h * .6, t.x - t.w * .35, base - t.h, t.x, base - t.h);
    ctx.bezierCurveTo(t.x + t.w * .35, base - t.h, t.x + t.w * .7, base - t.h * .6, t.x + t.w, base + 4);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(t.x, base - t.h, t.w * .35, 0, 6.3); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(t.x - t.w * .3, base);
    ctx.quadraticCurveTo(t.x - t.w * .15, base - t.h * .6, t.x, base - t.h * .8);
    ctx.strokeStyle = "rgba(226,214,190,.12)"; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.restore();
  }

  function drawTrail() {
    if (trail.length < 2) return;
    ctx.save();
    for (var i = 1; i < trail.length; i++) {
      var a = trail[i], b = trail[i - 1];
      ctx.beginPath();
      ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y);
      ctx.strokeStyle = "rgba(8,7,7," + (a.life * 0.5) + ")";
      ctx.lineWidth = 1 + a.life * 5;
      ctx.lineCap = "round";
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPool() {
    if (level <= 0.0005 && !ripples.length) return;
    var step = 5;
    ctx.beginPath();
    ctx.moveTo(0, H + 2);
    for (var x = 0; x <= W + step; x += step) ctx.lineTo(x, surfaceY(x));
    ctx.lineTo(W + 2, H + 2); ctx.closePath();
    var top = H - level * H;
    var g = ctx.createLinearGradient(0, top - 14, 0, Math.min(H, top + 180));
    g.addColorStop(0, "#241f1d"); g.addColorStop(.06, "#0d0b0a"); g.addColorStop(1, "#000");
    ctx.fillStyle = g; ctx.fill();

    ctx.beginPath();
    for (var x2 = 0; x2 <= W + step; x2 += step) x2 ? ctx.lineTo(x2, surfaceY(x2)) : ctx.moveTo(0, surfaceY(0));
    ctx.strokeStyle = "rgba(226,214,190,.13)"; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath();
    for (var x3 = 0; x3 <= W + step; x3 += step) {
      var yy = surfaceY(x3) + 3; x3 ? ctx.lineTo(x3, yy) : ctx.moveTo(0, yy);
    }
    ctx.strokeStyle = "rgba(176,30,34,.16)"; ctx.lineWidth = 2.4; ctx.stroke();
  }

  function drawCorners() {
    var a = level * 0.75;
    if (a < 0.01) return;
    var R = Math.max(W, H) * (0.25 + level * 0.5);
    [[0, 0], [W, 0], [0, H], [W, H]].forEach(function (c) {
      var g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], R);
      g.addColorStop(0, "rgba(4,3,3," + a + ")");
      g.addColorStop(.55, "rgba(4,3,3," + a * 0.35 + ")");
      g.addColorStop(1, "rgba(4,3,3,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });
  }

  function drawPen(x, y, tilt) {
    var L = 30, w = 6.2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.42 + tilt);
    ctx.save(); ctx.translate(3, 3); ctx.globalAlpha = .45; ctx.filter = "blur(3px)";
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-w, -L * .55, -w * .86, -L);
    ctx.quadraticCurveTo(0, -L - 4, w * .86, -L);
    ctx.quadraticCurveTo(w, -L * .55, 0, 0);
    ctx.fillStyle = "#000"; ctx.fill(); ctx.restore();

    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-w, -L * .55, -w * .86, -L);
    ctx.quadraticCurveTo(0, -L - 4, w * .86, -L);
    ctx.quadraticCurveTo(w, -L * .55, 0, 0);
    ctx.closePath();
    var g = ctx.createLinearGradient(-w, -L, w, 0);
    g.addColorStop(0, "#3a3330"); g.addColorStop(.3, "#141211");
    g.addColorStop(.72, "#000"); g.addColorStop(1, "#241f1d");
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "rgba(222,210,186,.22)"; ctx.lineWidth = .9; ctx.stroke();

    ctx.beginPath(); ctx.moveTo(0, -L * .72); ctx.lineTo(0, -1.5);
    ctx.strokeStyle = "#b7262a"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -L * .66, 2.5, 0, 6.3);
    ctx.fillStyle = "#6d0f12"; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.lineWidth = .8; ctx.stroke();

    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(-w * .8, -L - 16, w * 1.6, 17, 2.5);
      var g2 = ctx.createLinearGradient(-w, -L - 16, w, -L);
      g2.addColorStop(0, "#2b2422"); g2.addColorStop(.5, "#0a0908"); g2.addColorStop(1, "#1d1817");
      ctx.fillStyle = g2; ctx.fill();
      ctx.beginPath(); ctx.roundRect(-w * .8, -L - 7, w * 1.6, 3, 1);
      ctx.fillStyle = "#8e1316"; ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-w * .45, -L * .9);
    ctx.quadraticCurveTo(-w * .6, -L * .4, -w * .12, -L * .1);
    ctx.strokeStyle = "rgba(232,222,202,.35)"; ctx.lineWidth = 1.1; ctx.stroke();

    if (beadR > .4) {
      ctx.beginPath();
      ctx.moveTo(-beadR * .55, 0);
      ctx.quadraticCurveTo(-beadR, beadR * .5, 0, beadR * 1.7);
      ctx.quadraticCurveTo(beadR, beadR * .5, beadR * .55, 0);
      ctx.fillStyle = "#060505"; ctx.fill();
      ctx.beginPath(); ctx.arc(0, beadR * .95, beadR, 0, 6.3);
      var gb = ctx.createRadialGradient(-beadR * .3, beadR * .5, beadR * .1, 0, beadR, beadR * 1.4);
      gb.addColorStop(0, "#2c2725"); gb.addColorStop(.6, "#060505"); gb.addColorStop(1, "#000");
      ctx.fillStyle = gb; ctx.fill();
      ctx.beginPath(); ctx.arc(-beadR * .32, beadR * .62, beadR * .26, 0, 6.3);
      ctx.fillStyle = "rgba(228,216,194,.4)"; ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- цикл ---------- */
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000); last = now; T += dt;
    ctx.clearRect(0, 0, W, H);

    var px = P.lx, py = P.ly;
    P.lx += (P.x - P.lx) * Math.min(1, dt * 22);
    P.ly += (P.y - P.ly) * Math.min(1, dt * 22);
    var dx = P.lx - px, dy = P.ly - py;
    var speed = Math.hypot(dx, dy) / Math.max(dt, .001);
    P.tilt += ((-dx * .012) - P.tilt) * Math.min(1, dt * 8);

    if (CFG.trail && FINE && P.inside && speed > 40 && !over) {
      trail.push({ x: P.lx, y: P.ly + 4, life: 1 });
      if (trail.length > 26) trail.shift();
    }
    for (var i = trail.length - 1; i >= 0; i--) {
      trail[i].life -= dt * 1.5;
      if (trail[i].life <= 0) trail.splice(i, 1);
    }

    if (!over && !draining) {
      var rate = (FINE && P.inside ? CFG.penDripRate + Math.min(3.2, speed * .004) : .5) * (REDUCED ? .4 : 1);
      bead += dt * rate;
      beadR = Math.min(5.2, bead * 5.2);
      if (bead >= 1) { bead = 0; addDrop(P.lx, P.ly + 6, 3.4 + Math.random() * 2.2, dx * 6, 40); }
      if (!FINE && Math.random() < dt * 1.4) addDrop(Math.random() * W, -10, 3 + Math.random() * 2, 0, 60);

      if (CFG.wallDrips && walls.length < 6 && Math.random() < dt * (.35 + level * 1.6)) {
        walls.push({ x: Math.random() * W, len: 0, max: 60 + Math.random() * 260, w: 3 + Math.random() * 4, sp: 18 + Math.random() * 46 });
      }
    } else beadR = 0;

    for (var wi = walls.length - 1; wi >= 0; wi--) {
      var w = walls[wi];
      w.len += dt * w.sp;
      if (w.len >= w.max) {
        addDrop(w.x, w.len, w.w * .9, 0, 60);
        w.len = w.w; w.max *= .72;
        if (w.max < 18) { walls.splice(wi, 1); continue; }
      }
      if (w.len < surfaceY(w.x)) drawWall(w);
      else walls.splice(wi, 1);
    }

    for (var si = stains.length - 1; si >= 0; si--) {
      var s = stains[si];
      if (s.streak < s.max) s.streak += dt * (14 + s.r);
      else if (Math.random() < dt * .9) {
        addDrop(s.x, s.y + s.streak, 2.4 + Math.random() * 1.8, 0, 50);
        s.streak = s.r * .5; s.max *= .8;
      }
      if (s.y < surfaceY(s.x)) drawStain(s); else stains.splice(si, 1);
    }

    drawTrail();

    for (var j = drops.length - 1; j >= 0; j--) {
      var d = drops[j];
      d.vy += 1500 * dt; d.vx *= (1 - 1.6 * dt);
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.x < -30 || d.x > W + 30) { drops.splice(j, 1); continue; }
      var sy = surfaceY(d.x);
      if (d.y + d.r >= sy) { d.y = sy; if (!over) land(d); drops.splice(j, 1); continue; }
      drawDrop(d);
    }

    for (var k = ripples.length - 1; k >= 0; k--) {
      ripples[k].t += dt; ripples[k].a *= (1 - 2 * dt);
      if (ripples[k].a < .12) ripples.splice(k, 1);
    }

    drawPool();

    for (var ti = tendrils.length - 1; ti >= 0; ti--) {
      var t = tendrils[ti];
      t.t += dt;
      t.h = t.up ? t.h + dt * 70 : t.h - dt * 55;
      if (t.h >= t.max) t.up = false;
      if (t.h <= 0) { tendrils.splice(ti, 1); continue; }
      drawTendril(t);
    }

    if (CFG.corners) drawCorners();

    if (draining) {
      level = Math.max(0, level - dt * .75);
      if (level <= 0) draining = false;
    }

    if (FINE && P.inside && !over) drawPen(P.lx, P.ly, P.tilt);
    if (level >= CFG.gameOverAt && !over) gameOver();

    requestAnimationFrame(frame);
  }

  /* ============================================================
     5. GAME OVER
     ============================================================ */
  function gameOver() {
    over = true;
    drops.length = walls.length = tendrils.length = trail.length = 0;
    document.documentElement.classList.add("ink-shake");
    setTimeout(function () { document.documentElement.classList.remove("ink-shake"); }, 520);
    goEl.hidden = false;
    var btn = goEl.querySelector("[data-ink-restart]");
    addOutline(btn); btn.focus();
  }
  goEl.addEventListener("click", function (e) {
    if (!e.target.closest("[data-ink-restart]")) return;
    goEl.hidden = true;
    stains.length = drops.length = ripples.length = walls.length = tendrils.length = 0;
    over = false; draining = true;
  });

  /* ============================================================
     6. ОКНО ВМЕСТО ALERT
     ============================================================ */
  var lastFocus = null, timer = null;
  var sheet = {
    kicker: modal.querySelector(".ink-kicker"),
    title: modal.querySelector("h2"),
    msg: modal.querySelector(".ink-msg"),
    code: modal.querySelector(".ink-code"),
    acts: modal.querySelector(".ink-actions")
  };

  function closeModal() {
    modal.hidden = true;
    if (timer) { clearInterval(timer); timer = null; }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function inkAlert(opts) {
    if (typeof opts === "string") opts = { message: opts };
    lastFocus = document.activeElement;
    sheet.kicker.textContent = opts.kicker || "Сообщение";
    sheet.title.textContent = opts.title || "Внимание";
    sheet.msg.textContent = opts.message || "";
    sheet.code.textContent = opts.code || "";
    sheet.code.hidden = !opts.code;
    sheet.acts.innerHTML = "";
    (opts.actions || [{ label: "Понятно", primary: true }]).forEach(function (a) {
      var b = document.createElement("button");
      b.className = "ink-btn" + (a.primary ? " ink-btn--primary" : "");
      b.textContent = a.label;
      b.addEventListener("click", function () { closeModal(); if (a.run) a.run(); });
      sheet.acts.appendChild(b);
      addOutline(b);
    });
    modal.hidden = false;
    var first = sheet.acts.querySelector(".ink-btn");
    if (first) first.focus();
    return sheet.acts;
  }

  modal.addEventListener("pointerdown", function (e) {
    if (e.target.classList.contains("ink-overlay-bg")) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  /* ============================================================
     7. ПРОВЕРКА СТРАНИЦЫ
     ============================================================ */
  function goTo(url, path, forced) {
    var left = 3;
    var box = inkAlert({
      kicker: forced ? "На ваш страх и риск" : "Путь свободен",
      title: forced ? "Открываем без проверки" : "Страница на месте",
      message: "Переход начнётся автоматически. Можно открыть сразу или отменить.",
      code: url + (path || ""),
      actions: [
        { label: "Перейти сейчас", primary: true, run: function () { location.href = url; } },
        { label: "Отменить" }
      ]
    });
    var btn = box.querySelector(".ink-btn--primary"), base = btn.textContent;
    btn.textContent = base + " (" + left + ")";
    timer = setInterval(function () {
      if (--left <= 0) { clearInterval(timer); timer = null; location.href = url; return; }
      btn.textContent = base + " (" + left + ")";
    }, 1000);
  }

  function checkAndLoadSite(targetUrl, checkPath) {
    targetUrl = targetUrl || "/";
    checkPath = checkPath || "/";
    return fetch(checkPath, { method: "HEAD" }).then(function (res) {
      if (res.status === 404) { var e = new Error("Страница " + checkPath + " возвращает статус 404"); e.status = 404; throw e; }
      if (!res.ok) { var e2 = new Error("Сервер ответил статусом " + res.status); e2.status = res.status; throw e2; }
      goTo(targetUrl, checkPath);
    }).catch(function (error) {
      inkAlert({
        kicker: error.status ? "Ответ сервера · " + error.status : "Нет связи",
        title: error.status === 404 ? "Чернила не нашли страницу" : "Загрузка не удалась",
        message: error.status
          ? "Адрес существует, но сервер вернул ошибку. Открывать сайт сейчас не стоит — скорее всего там пусто."
          : "До адреса не удалось достучаться: сеть недоступна либо запрос заблокирован политикой другого домена.",
        code: checkPath + "  →  " + error.message,
        actions: [
          { label: "Повторить", primary: true, run: function () { checkAndLoadSite(targetUrl, checkPath); } },
          { label: "Всё равно открыть", run: function () { goTo(targetUrl, checkPath, true); } },
          { label: "Закрыть" }
        ]
      });
    });
  }

  /* ============================================================
     8. ЭКСПОРТ
     ============================================================ */
  window.checkAndLoadSite = checkAndLoadSite;
  window.inkAlert = inkAlert;
  window.Ink = {
    splatter: splatter,
    drain: function () { draining = true; stains.length = 0; },
    getLevel: function () { return level; },
    setLevel: function (v) { level = Math.max(0, Math.min(1, v)); },
    gameOver: gameOver,
    config: CFG,
    scan: scanOutlines
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
