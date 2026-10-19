/* 박성희 포트폴리오 — 스크롤 연출
   - 모든 연출은 화면에 처음 들어올 때 한 번만 재생
   - prefers-reduced-motion 이거나 IntersectionObserver 미지원이면 연출 없이 바로 표시 */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasIO = "IntersectionObserver" in window;
  var motion = !reduceMotion && hasIO;

  /* ---------- 로그타워 경험치 바 ---------- */
  var floors = document.querySelectorAll(".floor");
  var totalFloors = floors.length;
  var expHud = document.querySelector(".exp-hud");
  var expFill = document.getElementById("expFill");
  var expLv = document.getElementById("expLv");
  var expPct = document.getElementById("expPct");
  var currentLevel = 0;

  function setLevel(level) {
    if (level <= currentLevel) return; // 경험치는 줄어들지 않음
    currentLevel = level;
    var pct = Math.round((level / totalFloors) * 100);
    expFill.style.width = pct + "%";
    expLv.textContent = level;
    expPct.textContent = pct;
    if (level >= totalFloors) expHud.classList.add("is-clear");
  }

  /* ---------- 숫자 카운트업 ---------- */
  function countUp(el) {
    var to = parseFloat(el.getAttribute("data-to"));
    var dec = parseInt(el.getAttribute("data-dec") || "0", 10);
    var duration = 800;
    var start = null;
    function frame(t) {
      if (start === null) start = t;
      var p = Math.min((t - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (to * eased).toFixed(dec);
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = to.toFixed(dec);
    }
    requestAnimationFrame(frame);
  }

  // 연출 없이 최종 상태로
  if (!motion) {
    setLevel(totalFloors);
    return;
  }

  root.classList.add("motion");
  root.classList.add("js-flip");

  /* ---------- 한 번만 감지하는 헬퍼 ----------
     IntersectionObserver로 감지하고, 빠른 점프 스크롤로 요소가 화면을 건너뛰어
     콜백이 오지 않는 경우를 위해 스크롤이 멈출 때 지나간 요소를 한 번 더 확인한다 */
  var pending = [];
  function onceVisible(elements, options, callback) {
    var group = { done: callback, items: [] };
    var io = new IntersectionObserver(function (entries) {
      entries
        .filter(function (e) { return e.isIntersecting || e.boundingClientRect.top < 0; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; })
        .forEach(function (e) { fire(e.target); });
    }, options);
    function fire(el) {
      if (group.items.indexOf(el) === -1) return;
      group.items.splice(group.items.indexOf(el), 1);
      io.unobserve(el);
      callback(el);
    }
    Array.prototype.forEach.call(elements, function (el) {
      group.items.push(el);
      io.observe(el);
    });
    group.fire = fire;
    pending.push(group);
  }

  var settleTimer = null;
  window.addEventListener("scroll", function () {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () {
      pending.forEach(function (group) {
        group.items.slice().forEach(function (el) {
          if (el.getBoundingClientRect().top < window.innerHeight * 0.7) group.fire(el);
        });
      });
    }, 200);
  }, { passive: true });

  /* ---------- 공통: 등장 연출 (.reveal) ---------- */
  // 화면 아래 40px 앞에서 미리 시작해, 보이기 전에 내용이 사라지는 순간이 없게 한다
  var early = { rootMargin: "0px 0px 40px 0px" };
  onceVisible(document.querySelectorAll(".reveal"), early, function (el) {
    el.classList.add("play");
  });

  /* ---------- 로그타워: 층이 쌓이듯 등장 → LV UP + 경험치 + 카운트업 ---------- */
  onceVisible(floors, early, function (el) {
    el.classList.add("play");
  });
  onceVisible(floors, { threshold: 0.2, rootMargin: "0px 0px -15% 0px" }, function (el) {
    el.classList.add("leveled");
    el._leveledAt = performance.now();
    el.dispatchEvent(new CustomEvent("leveled"));
    setLevel(parseInt(el.getAttribute("data-floor"), 10));
    el.querySelectorAll(".count").forEach(function (num) {
      setTimeout(function () { countUp(num); }, 300);
    });
  });

  /* ---------- 로그타워: 상자를 베어 이미지 공개 (figure.frame[data-reveal="slash"]) ----------
     상자는 JS가 덮으므로 JS가 실패하면 상자 없이 이미지가 그대로 보인다 */
  function initCrateSlash() {
    var frames = document.querySelectorAll('.frame[data-reveal="slash"]');
    if (!frames.length) return;
    var CHIPS = [[-40, -30], [34, -38], [48, 8], [-46, 20], [10, 46]]; // 파편이 튀는 방향(px)
    var LVUP_END = 750; // LV UP 배지: 0.25초 지연 + 0.5초 재생
    var GAP = 250;      // 같은 층에 상자가 여러 개면 0.25초 간격으로 차례로 벤다
    var nextSlot = 0;

    // 게임 속 상자 스프라이트가 있으면 사용, 없으면 CSS로 그린 상자
    var sprite = null;
    function applySprite(art) {
      art.classList.add("is-sprite");
      art.style.backgroundImage = 'url("' + sprite + '")';
    }
    var probe = new Image();
    probe.onload = function () {
      sprite = probe.src;
      document.querySelectorAll(".crate-art").forEach(applySprite);
    };
    probe.src = "assets/rt_crate.png";

    frames.forEach(function (frame) {
      var img = frame.querySelector("img");
      if (!img || frame.classList.contains("is-missing")) return;
      // 이미지만 감싸서 상자가 제목줄을 빼고 이미지 영역 전체를 덮게 한다
      var host = document.createElement("div");
      host.className = "crate-host";
      img.parentNode.insertBefore(host, img);
      host.appendChild(img);

      var cover = document.createElement("div");
      cover.className = "crate-cover";
      cover.setAttribute("aria-hidden", "true");
      var html = '<div class="crate-box">' +
        '<div class="crate-piece crate-piece-a"><div class="crate-art"></div></div>' +
        '<div class="crate-piece crate-piece-b"><div class="crate-art"></div></div>' +
        '<span class="crate-slash"></span>';
      CHIPS.forEach(function (c) {
        html += '<span class="crate-chip" style="--dx:' + c[0] + "px;--dy:" + c[1] + 'px"></span>';
      });
      cover.innerHTML = html + "</div>";
      host.appendChild(cover);
      if (sprite) cover.querySelectorAll(".crate-art").forEach(applySprite);
      // 이미지를 못 불러오면 연출 없이 빈칸 표시
      img.addEventListener("error", function () { cover.remove(); });
    });

    function slash(cover) {
      // 칼날이 상자의 왼쪽 위 → 오른쪽 아래 대각선을 따라가도록 실제 크기로 계산
      var w = cover.offsetWidth, h = cover.offsetHeight;
      var len = Math.sqrt(w * w + h * h);
      var ext = len * 0.06; // 상자 바깥으로 살짝 더 그어짐
      var ang = Math.atan2(h, w);
      var st = cover.querySelector(".crate-slash").style;
      st.setProperty("--sx", -ext * Math.cos(ang) + "px");
      st.setProperty("--sy", -ext * Math.sin(ang) + "px");
      st.setProperty("--sl", len + ext * 2 + "px");
      st.setProperty("--sa", ang + "rad");
      cover.classList.add("is-slashing");
      setTimeout(function () { cover.remove(); }, 700);
    }

    onceVisible(frames, { threshold: 0.5 }, function (frame) {
      var cover = frame.querySelector(".crate-cover");
      if (!cover) return;
      if (frame.classList.contains("is-missing")) { cover.remove(); return; }
      var floor = frame.closest(".floor");
      var seenAt = performance.now();
      function start() {
        // 화면에 들어오고 0.3초 뒤, 그리고 그 층의 LV UP 배지가 끝난 뒤에 벤다
        var at = Math.max(seenAt + 300, floor ? floor._leveledAt + LVUP_END : 0, nextSlot);
        nextSlot = at + GAP;
        setTimeout(function () { slash(cover); }, Math.max(0, at - performance.now()));
      }
      if (!floor || floor._leveledAt) start();
      else floor.addEventListener("leveled", start, { once: true });
    });
  }
  initCrateSlash();

  /* ---------- ZooJack: 딜러가 나눠 주듯 0.15초 간격으로 뒤집기 ---------- */
  var flipQueue = [];
  var flipTimer = null;
  function next() {
    var card = flipQueue.shift();
    if (!card) { flipTimer = null; return; }
    card.classList.add("is-flipped");
    flipTimer = setTimeout(next, 400);
  }
  // 카드 윗부분이 화면 아래 30% 선을 넘어 충분히 보일 때 뒤집는다
  onceVisible(document.querySelectorAll(".card"), { rootMargin: "0px 0px -30% 0px" }, function (el) {
    flipQueue.push(el);
    if (!flipTimer) next();
  });

  /* ---------- 퀘스트: 위에서부터 한 줄씩 ---------- */
  var questDelay = 0;
  var questReset = null;
  onceVisible(document.querySelectorAll(".q-row"), early, function (el) {
    el.style.animationDelay = questDelay + "s";
    el.classList.add("play");
    questDelay += 0.2;
    clearTimeout(questReset);
    questReset = setTimeout(function () { questDelay = 0; }, 100);
  });
})();
