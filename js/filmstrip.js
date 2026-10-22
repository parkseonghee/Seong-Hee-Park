/* 필름 스트립: 가로로 넘기는 필름 프레임
   - 무대(.stage)는 scroll-snap 가로 트랙. 페이지 하나 = 필름 프레임 하나
   - 휠 한 번 / ←→ / PageUp·PageDown / Space = 한 페이지 이동 (이동 중 700ms 입력 무시)
     패널 안에 세로 스크롤이 남아 있으면 그 스크롤을 먼저 처리하고, 끝에 닿았을 때만 이동
   - 768px 이하에서는 휠 변환 없이 스와이프(네이티브 scroll-snap)만
   - URL 해시로 페이지 지정 (#profile, #roguetower ...), 뒤로가기 지원
   - 테이프는 requestAnimationFrame으로 이동. 페이지가 넘어갈 때 5배로 빨라졌다가 감속
   - 큰 컷의 영상은 현재 페이지일 때만 재생 (webm → mp4 → GIF 순서로 대체)
   - 왼쪽 목차(비디오 대여점 테이프 더미)를 누르면 테이프가 뽑혔다 돌아오며 그 페이지로 이동
   - 페이지 정보(순서 · 해시 · 이름 · 그룹 색)는 scenes 배열 하나를 필름 테이프 / 목차 / 위치 표시 / 해시가 함께 쓴다
   - 움직임 줄이기 설정이면 테이프 정지, 페이지 이동 즉시, 영상 대신 첫 프레임 */
(function () {
  "use strict";

  var tv = document.querySelector(".tv-on");
  if (tv) tv.addEventListener("animationend", function (e) { if (e.target === tv) tv.remove(); });

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobile = window.matchMedia("(max-width: 768px)");

  var LOCK_MS = 700;
  var BASE_SPEED = 0.08;   // 테이프 기본 속도 (px/ms) — 기존 CSS 애니메이션(2880px / 36s)과 같음
  var BOOST = 4;           // 페이지가 넘어갈 때 추가 배수 (1 + 4 = 5배)
  var BOOST_DECAY_MS = 450;

  var stage = document.getElementById("stage");
  var pages = Array.prototype.slice.call(stage.querySelectorAll(".page"));

  /* ---------- 페이지 데이터: HTML의 data-* 를 한 번만 읽어 모든 곳에서 같이 쓴다 ---------- */
  // 그룹 이름 → 색. 페이지 순서는 여기가 아니라 HTML의 <section> 배치 순서로 정해진다
  var GROUP_COLORS = {
    profile: "#6FA3D8", roguetower: "#D9564A", zoojack: "#4FAE78",
    growth: "#A3C76B", roblox: "#C9A27E",
    history: "#3FB8C4", study: "#E07A3F", goals: "#D96BA0", contact: "#B48AD8"
  };
  var TILTS = [-8, 5, -4, 6, -3, 4, -6, 3, -5, 7]; // 목차 테이프를 대충 쌓은 기울기 (페이지가 더 많으면 반복)
  var scenes = pages.map(function (p, i) {
    var group = p.getAttribute("data-group");
    return {
      el: p,
      id: p.getAttribute("data-scene"),       // URL 해시
      title: p.getAttribute("data-title"),    // 테이프 · 목차 · SCENE 표시
      num: pad(i + 1),
      group: group,
      color: GROUP_COLORS[group] || "#888"
    };
  });
  var tapes = Array.prototype.slice.call(document.querySelectorAll(".tape-track"));
  var sceneNum = document.getElementById("sceneNum");
  var sceneName = document.getElementById("sceneName");
  var sceneIndex = document.getElementById("sceneIndex");
  document.getElementById("sceneTotal").textContent = pad(pages.length);

  var current = -1;
  var target = 0;          // 마지막으로 가라고 한 페이지 (연속 키 입력이 누적되게)
  var autoScrolling = false;
  var lockUntil = 0;
  var boost = 0;
  var hashTimer = null;

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- 테이프: 페이지 목록으로 프레임 번호를 채운다 ---------- */
  var segHtml = scenes.map(function (sc, i) {
    return '<span class="tape-seg"><b data-n="' + i + '">' + sc.num + "</b> " +
      sc.title + " · SEONGHEE PARK · UNITY CLIENT ·</span>";
  }).join("");
  tapes.forEach(function (t) {
    // 두 벌을 이어 붙여 끊김 없이 반복
    t.innerHTML = '<span class="tape-copy">' + segHtml + '</span><span class="tape-copy">' + segHtml + "</span>";
  });
  var tapeNums = Array.prototype.slice.call(document.querySelectorAll(".tape-seg b"));

  /* ---------- 왼쪽 목차: VHS 테이프 등면 ---------- */
  var indexNav = document.getElementById("tapeIndex");
  if (indexNav) indexNav.style.setProperty("--vhs-count", scenes.length); // 페이지 수에 맞춰 테이프 높이 조절
  var vhs = scenes.map(function (sc, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "vhs";
    b.style.setProperty("--tilt", TILTS[i % TILTS.length] + "deg");
    b.style.setProperty("--band", sc.color);
    b.innerHTML = '<span class="vhs-label"><b class="vhs-num">' + sc.num + '</b><span class="vhs-name">' +
      sc.title + '</span></span><span class="vhs-band" aria-hidden="true"></span>';
    b.addEventListener("click", function () {
      if (!reduceMotion) {
        // 쭉 뽑혔다가 제자리로 (애니메이션을 다시 걸기 위해 클래스를 뺐다 넣는다)
        b.classList.remove("is-pulling");
        void b.offsetWidth;
        b.classList.add("is-pulling");
      }
      goTo(i);
    });
    b.addEventListener("animationend", function () { b.classList.remove("is-pulling"); });
    if (indexNav) indexNav.appendChild(b);
    return b;
  });

  var offset = 0;
  var lastFrame = 0;
  function drawTapes() {
    var w = tapes[0].firstChild.offsetWidth;
    if (!w) return;
    var x = offset % w;
    tapes[0].style.transform = "translateX(" + (x - w) + "px)"; // 위: 오른쪽으로
    tapes[1].style.transform = "translateX(" + (-x) + "px)";    // 아래: 왼쪽으로
  }
  function tick(now) {
    var dt = lastFrame ? Math.min(now - lastFrame, 64) : 0;
    lastFrame = now;
    offset += BASE_SPEED * (1 + boost) * dt;
    boost *= Math.exp(-dt / BOOST_DECAY_MS);
    drawTapes();
    requestAnimationFrame(tick);
  }
  if (reduceMotion) {
    drawTapes();
  } else {
    requestAnimationFrame(tick);
  }

  /* ---------- 큰 컷의 영상 (이 컷 안에서만 재생) ---------- */
  var medias = Array.prototype.slice.call(stage.querySelectorAll(".cut-media"));

  function setupMedia(box) {
    if (box._mode) return;
    var srcs = [["webm", "video/webm"], ["mp4", "video/mp4"]].filter(function (s) { return box.getAttribute("data-" + s[0]); });
    if (!srcs.length) { toGif(box); return; }
    box._mode = "video";
    var video = document.createElement("video");
    video.muted = true; video.loop = true; video.playsInline = true;
    video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
    video.setAttribute("aria-hidden", "true"); video.tabIndex = -1;
    video.preload = "auto";
    srcs.forEach(function (s, i) {
      var source = document.createElement("source");
      source.type = s[1];
      // 마지막 source까지 실패하면 GIF로
      if (i === srcs.length - 1) source.addEventListener("error", function () { toGif(box); });
      source.src = box.getAttribute("data-" + s[0]);
      video.appendChild(source);
    });
    video.addEventListener("error", function () { toGif(box); });
    video.addEventListener("playing", function () { video.classList.add("is-on"); });
    box.insertBefore(video, box.querySelector(".media-cap"));
    box._video = video;
  }

  function toGif(box) {
    if (box._mode === "gif") return;
    box._mode = "gif";
    if (box._video) { box._video.remove(); box._video = null; }
    var src = box.getAttribute("data-gif");
    if (!src) return; // poster만 남는다
    var img = document.createElement("img");
    img.className = "media-gif";
    img.alt = "";
    img.hidden = !box._playing;
    img.addEventListener("load", function () { img.classList.add("is-on"); }, { once: true });
    box.insertBefore(img, box.querySelector(".media-cap"));
    box._gif = img;
    img.src = src;
  }

  function playMedia(box) {
    if (reduceMotion) return;
    setupMedia(box);
    box._playing = true;
    if (box._video) {
      var p = box._video.play();
      if (p && p.catch) p.catch(function () { /* 자동 재생이 막히면 poster가 그대로 보인다 */ });
    } else if (box._gif) {
      box._gif.hidden = false;
    }
  }

  // GIF는 멈출 수 없으므로 숨겨서 그리기 비용을 없앤다
  function pauseMedia(box) {
    box._playing = false;
    if (box._video) box._video.pause();
    if (box._gif) box._gif.hidden = true;
  }

  function syncMedia() {
    medias.forEach(function (box) {
      if (!document.hidden && !openSheet && pages[current] && pages[current].contains(box)) playMedia(box);
      else pauseMedia(box);
    });
  }
  document.addEventListener("visibilitychange", syncMedia);

  /* ---------- 현재 페이지 ---------- */
  function setCurrent(i, opts) {
    opts = opts || {};
    if (i === current) return;
    var first = current < 0;
    current = i;
    pages.forEach(function (p, n) {
      p.classList.toggle("is-current", n === i);
      if (n === i) p.setAttribute("aria-current", "step"); else p.removeAttribute("aria-current");
    });
    tapeNums.forEach(function (b) { b.classList.toggle("is-on", +b.getAttribute("data-n") === i); });
    vhs.forEach(function (b, n) {
      b.classList.toggle("is-current", n === i);
      if (n === i) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
    sceneNum.textContent = sceneIndex.textContent = scenes[i].num;
    sceneName.textContent = scenes[i].title;
    if (!first && !reduceMotion) boost = BOOST;
    syncMedia();

    // 스와이프 중간 페이지까지 기록되지 않게, 멈춘 뒤에 해시를 남긴다
    clearTimeout(hashTimer);
    var hash = "#" + scenes[i].id;
    if (opts.push !== false) {
      hashTimer = setTimeout(function () {
        if (location.hash !== hash) history.pushState(null, "", hash);
      }, 300);
    }
  }

  function leftFor(i) {
    var p = pages[i];
    return p.offsetLeft - (stage.clientWidth - p.offsetWidth) / 2;
  }

  function nearest() {
    var center = stage.scrollLeft + stage.clientWidth / 2;
    var best = 0, bestD = Infinity;
    pages.forEach(function (p, i) {
      var d = Math.abs(p.offsetLeft + p.offsetWidth / 2 - center);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function goTo(i, opts) {
    opts = opts || {};
    i = Math.max(0, Math.min(pages.length - 1, i));
    target = i;
    var left = leftFor(i);
    var smooth = !reduceMotion && !opts.instant;
    if (Math.abs(stage.scrollLeft - left) > 1) {
      autoScrolling = smooth;
      stage.scrollTo({ left: left, behavior: smooth ? "smooth" : "auto" });
    }
    setCurrent(i, opts);
  }

  function step(dir) {
    // 이동이 끝나기 전에 또 누르면 목표 페이지 기준으로 이어서 이동
    var base = autoScrolling ? target : current;
    if (base + dir < 0 || base + dir >= pages.length) return false;
    goTo(base + dir);
    return true;
  }

  /* ---------- 스크롤(스와이프)로 바뀐 페이지 반영 ---------- */
  var scrollRaf = 0, scrollEndTimer = null;
  function onScrollEnd() {
    autoScrolling = false;
    var i = nearest();
    target = i;
    setCurrent(i);
  }
  stage.addEventListener("scroll", function () {
    if (!scrollRaf) {
      scrollRaf = requestAnimationFrame(function () {
        scrollRaf = 0;
        if (!autoScrolling) setCurrent(target = nearest());
      });
    }
    clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(onScrollEnd, 150); // scrollend 미지원 브라우저 대비
  }, { passive: true });
  stage.addEventListener("scrollend", function () { clearTimeout(scrollEndTimer); onScrollEnd(); });

  /* ---------- 패널 안 세로 스크롤이 남았는지 ---------- */
  function scrollableInside(el, page, dy) {
    var stop = page.querySelector(".page-in");
    for (; el && el !== page; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 1) {
        var oy = getComputedStyle(el).overflowY;
        if (oy === "auto" || oy === "scroll") {
          if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return el;
          if (dy < 0 && el.scrollTop > 0) return el;
        }
      }
      if (el === stop) break;
    }
    return null;
  }

  /* ---------- 휠 → 가로 이동 (데스크톱) ---------- */
  var lastWheelAt = 0, lastWheelMag = 0, innerScrollAt = 0;
  window.addEventListener("wheel", function (e) {
    if (openSheet) return; // 상세 시트가 열려 있으면 시트 스크롤 그대로
    if (mobile.matches || e.ctrlKey) return; // 모바일은 스와이프만, Ctrl+휠은 확대
    var vertical = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
    var delta = vertical ? e.deltaY : e.deltaX;
    var now = performance.now();

    // 패널 안에 세로로 더 스크롤할 곳이 있으면 그쪽을 먼저
    var page = e.target.closest && e.target.closest(".page");
    if (vertical && page && page === pages[current] && scrollableInside(e.target, page, delta)) {
      innerScrollAt = now;
      return;
    }

    e.preventDefault();
    var mag = Math.abs(delta);
    var gap = now - lastWheelAt, prevMag = lastWheelMag;
    lastWheelAt = now; lastWheelMag = mag;

    if (now < lockUntil) return;
    if (mag < 2) return;
    if (now - innerScrollAt < 400) return;          // 패널 끝에 막 닿은 같은 제스처는 넘기지 않음
    if (gap < 100 && mag <= prevMag) return;          // 트랙패드 관성 꼬리
    if (step(delta > 0 ? 1 : -1)) lockUntil = now + LOCK_MS;
  }, { passive: false });

  /* ---------- 키보드 ---------- */
  document.addEventListener("keydown", function (e) {
    if (openSheet || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;
    if (t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
    var dir = 0, scrollFirst = false;
    switch (e.key) {
      case "ArrowRight": dir = 1; break;
      case "ArrowLeft": dir = -1; break;
      case "PageDown": dir = 1; scrollFirst = true; break;
      case "PageUp": dir = -1; scrollFirst = true; break;
      case "Enter": // 프로젝트 페이지에서 Enter = 상세 보기 (링크·버튼 위에서는 그대로)
        if (t.closest && t.closest("a, button, summary")) return;
        if (pages[current].getAttribute("data-detail")) openDetail(pages[current].getAttribute("data-detail"));
        return;
      case " ":
        if (t.closest && t.closest("a, button, summary")) return; // Space로 버튼 누르기는 그대로
        dir = e.shiftKey ? -1 : 1; scrollFirst = true; break;
      default: return;
    }
    e.preventDefault();
    if (scrollFirst) {
      var inner = pages[current].querySelector(".page-in");
      if (scrollableInside(inner, pages[current], dir)) {
        inner.scrollBy({ top: dir * inner.clientHeight * 0.85, behavior: reduceMotion ? "auto" : "smooth" });
        return;
      }
    }
    step(dir);
  });

  /* ---------- 옆 페이지 클릭 = 그 페이지로 이동 ---------- */
  stage.addEventListener("mousedown", function (e) {
    var page = e.target.closest(".page");
    if (page && page !== pages[current]) e.preventDefault(); // 포커스·텍스트 선택 막기
  }, true);
  stage.addEventListener("click", function (e) {
    var page = e.target.closest(".page");
    if (!page) return;
    if (page === pages[current]) {
      // 프로젝트 페이지는 패널 아무 데나 누르면 상세 시트가 열림 (링크·버튼·펼치기, 글자 드래그는 제외)
      var detail = page.getAttribute("data-detail");
      var sel = window.getSelection && String(window.getSelection());
      if (detail && (e.target.closest("[data-open-detail]") ||
          (!sel && !e.target.closest("a, button, summary, details, input")))) openDetail(detail);
      return;
    }
    e.preventDefault();
    e.stopPropagation(); // 옆 페이지 안의 링크·버튼은 누르지 않음
    goTo(pages.indexOf(page));
  }, true);
  // Tab으로 옆 페이지 안에 포커스가 들어가면 그 페이지로
  stage.addEventListener("focusin", function (e) {
    var page = e.target.closest(".page");
    if (page && page !== pages[current]) goTo(pages.indexOf(page));
  });

  /* ---------- 프로젝트 상세 시트 (dialog) ----------
     - 열 때 해시를 #<시트 id>로 남겨서 뒤로가기 = 닫기
     - 다른 시트로 바꿀 때는 해시를 교체만 하고, 닫을 때 그 프로젝트 페이지 해시로 맞춘다 */
  var sheets = {};
  var openSheet = null;
  var sheetPushed = false, sheetSwitched = false;
  Array.prototype.forEach.call(document.querySelectorAll("dialog.sheet"), function (d) {
    sheets[d.id] = d;
    // close 이벤트는 비동기라, 코드로 닫을 때는 openSheet를 먼저 바꿔 두고 여기서 걸러낸다
    d.addEventListener("close", function () {
      if (openSheet !== d) return;
      openSheet = null;
      syncMedia();
      if (sheetPushed && !sheetSwitched) history.back();
      else history.replaceState(null, "", "#" + scenes[current].id);
      sheetPushed = sheetSwitched = false;
    });
    d.addEventListener("click", function (e) {
      if (e.target === d || e.target.closest("[data-close-detail]")) { d.close(); return; }
      var sw = e.target.closest("[data-switch-detail]");
      if (sw) openDetail(sw.getAttribute("data-switch-detail"));
    });
  });

  function ownerOf(id) {
    for (var i = 0; i < pages.length; i++) if (pages[i].getAttribute("data-detail") === id) return i;
    return -1;
  }

  function openDetail(id, opts) {
    opts = opts || {};
    var d = sheets[id];
    if (!d || openSheet === d) return;
    var prev = openSheet;
    openSheet = d;
    if (prev) prev.close();
    var owner = ownerOf(id);
    if (owner >= 0 && owner !== current) goTo(owner, { instant: true, push: false });
    clearTimeout(hashTimer);
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    d.scrollTop = 0;
    if (opts.push !== false) {
      if (prev) { history.replaceState(null, "", "#" + id); sheetSwitched = true; }
      else { history.pushState(null, "", "#" + id); sheetPushed = true; }
    }
    syncMedia();
  }

  function closeSilently() {
    if (!openSheet) return;
    var d = openSheet;
    openSheet = null;
    sheetPushed = sheetSwitched = false;
    d.close();
    syncMedia();
  }

  /* ---------- URL 해시 ---------- */
  function indexFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    for (var i = 0; i < scenes.length; i++) if (scenes[i].id === id) return i;
    return -1;
  }
  window.addEventListener("popstate", function () {
    var id = decodeURIComponent(location.hash.slice(1));
    if (sheets[id]) { openDetail(id, { push: false }); return; }
    closeSilently();
    var i = indexFromHash();
    goTo(i < 0 ? 0 : i, { push: false });
  });

  /* ---------- 패널 안 스크롤 없애기 (데스크톱) ----------
     내용이 패널보다 크면 zoom으로 줄여서 한 화면에 맞춘다.
     줄이면 줄바꿈이 달라지므로 몇 번 반복해서 맞춘다. 모바일은 세로 스크롤 그대로 */
  function fitPage(page) {
    var inner = page.querySelector(".page-in");
    var el = inner.querySelector(".cuts, .profile");
    if (!el) return;
    el.style.zoom = el.style.minHeight = "";
    if (mobile.matches) return;
    var cs = getComputedStyle(inner);
    var avail = inner.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var zoom = 1;
    for (var n = 0; n < 5; n++) {
      var h = el.getBoundingClientRect().height;
      if (h <= avail + 1) break;
      zoom = Math.max(0.5, zoom * avail / h - 0.005);
      el.style.zoom = zoom;
      // zoom을 걸면 min-height: 100%도 같이 줄어드니, 패널 높이를 꽉 채우도록 보정
      if (el.classList.contains("cuts")) el.style.minHeight = (avail / zoom) + "px";
    }
  }
  function fitPages() { pages.forEach(fitPage); }

  var resizeRaf = 0;
  window.addEventListener("resize", function () {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(function () {
      fitPages();
      if (current >= 0) stage.scrollTo({ left: leftFor(current), behavior: "auto" });
    });
  });
  fitPages();
  // 플레이 이력 · 공부 계획처럼 내용이 바뀌는 페이지가 다시 맞춰 달라고 할 때
  document.addEventListener("film:refit", function () { requestAnimationFrame(fitPages); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPages);
  window.addEventListener("load", fitPages);

  var startId = decodeURIComponent(location.hash.slice(1));
  var start = sheets[startId] ? ownerOf(startId) : indexFromHash();
  goTo(start < 0 ? 0 : start, { instant: true, push: false });
  if (sheets[startId]) openDetail(startId, { push: false });
})();
