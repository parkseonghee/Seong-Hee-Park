/* 박성희 포트폴리오 — Unity 에디터 레이아웃
   - Hierarchy에서 항목을 고르면 <template data-item>의 내용을 Scene / Inspector에 복제해 넣는다
   - Console은 프로젝트 단위(<template data-console-for>) 트러블슈팅 로그
   - 선택 상태는 주소 해시(#roguetower)에 담아, 바로 열기와 뒤로 가기를 지원한다
   - ▶ 버튼: Scene의 GIF를 현재 프레임에서 멈추거나(캔버스로 고정) 다시 재생 */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FADE_MS = 150;

  var tree = document.getElementById("tree");
  var sceneView = document.getElementById("sceneView");
  var inspectorView = document.getElementById("inspectorView");
  var consoleView = document.getElementById("consoleView");
  var scenePath = document.getElementById("scenePath");
  var consoleCount = document.getElementById("consoleCount");
  var playBtn = document.getElementById("playBtn");

  var treeItems = Array.prototype.slice.call(tree.querySelectorAll('[role="treeitem"]'));
  var templates = {};
  document.querySelectorAll("template[data-item]").forEach(function (t) { templates[t.getAttribute("data-item")] = t; });
  var consoleTemplates = {};
  document.querySelectorAll("template[data-console-for]").forEach(function (t) { consoleTemplates[t.getAttribute("data-console-for")] = t; });

  var DEFAULT_ID = "intro";
  var currentId = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function itemById(id) { return tree.querySelector('[data-item="' + id + '"]'); }
  function labelOf(li) { return li.querySelector(".tree-label").textContent; }
  function parentItem(li) { return li.parentElement.closest('[role="treeitem"]'); }
  function group(li) { return li.querySelector(':scope > [role="group"]'); }
  function pathOf(li) {
    var names = [];
    for (var cur = li; cur; cur = parentItem(cur)) names.unshift(labelOf(cur));
    return names.join(" / ");
  }

  /* =========================================================
     Inspector 컴포넌트 헬퍼
     ========================================================= */
  function comp(title, bodyHtml, opts) {
    opts = opts || {};
    return '<section class="comp"><h3 class="comp-head"><button type="button" aria-expanded="' + (opts.collapsed ? "false" : "true") + '">' +
      esc(title) + "</button>" + (opts.badge ? '<span class="comp-badge">' + esc(opts.badge) + "</span>" : "") +
      '</h3><div class="comp-body">' + bodyHtml + "</div></section>";
  }
  function row(label, valueHtml) {
    return '<div class="row"><dt>' + esc(label) + "</dt><dd>" + valueHtml + "</dd></div>";
  }

  // 컴포넌트 본문을 한 겹 감싸서 높이 애니메이션(0fr ↔ 1fr)이 되게 하고, 접힌 상태를 반영
  function setupComps(root) {
    root.querySelectorAll(".comp").forEach(function (c) {
      var body = c.querySelector(".comp-body");
      if (!body.querySelector(":scope > .comp-inner")) {
        var inner = document.createElement("div");
        inner.className = "comp-inner";
        while (body.firstChild) inner.appendChild(body.firstChild);
        body.appendChild(inner);
      }
      var btn = c.querySelector(".comp-head button");
      c.classList.toggle("is-collapsed", btn.getAttribute("aria-expanded") === "false");
    });
  }
  inspectorView.addEventListener("click", function (e) {
    var btn = e.target.closest(".comp-head button");
    if (!btn) return;
    var open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.closest(".comp").classList.toggle("is-collapsed", !open);
  });

  /* =========================================================
     records.js 데이터로 그리는 항목 (PlayHistory / StudyPlan)
     ========================================================= */
  // "121.4시간", "119분", "2026.07 ~ 2026.09 (89.0시간 / 37일)" → 분. 시간 기록이 없으면 0
  function toMinutes(text) {
    var h = /([\d.]+)시간/.exec(text);
    if (h) return parseFloat(h[1]) * 60;
    var m = /(\d+)분/.exec(text);
    return m ? parseInt(m[1], 10) : 0;
  }
  function isRoguelike(genre) { return /로그라이[크트]/.test(genre); }

  var renderers = {
    "play-stats": function (el) {
      if (typeof PLAY_HISTORY === "undefined") return;
      var d = PLAY_HISTORY;
      var pcMinutes = d.pc.reduce(function (s, g) { return s + toMinutes(g[2]); }, 0);
      var rogue = d.pc.concat(d.mobile).filter(function (g) { return isRoguelike(g[3]); }).length;
      el.innerHTML =
        "<div><dt>PC (Steam)</dt><dd>" + d.pc.length + '종<span class="sub">누적 약 ' + Math.round(pcMinutes / 60) + "시간</span></dd></div>" +
        "<div><dt>모바일</dt><dd>" + d.mobile.length + '종<span class="sub">Play 게임즈 기록 153종 중 상위</span></dd></div>' +
        "<div><dt>로그라이크 계열</dt><dd>" + rogue + '종<span class="sub">로그타워 개발에 직접 참고</span></dd></div>';
    },
    "play-inspector": function (el) {
      if (typeof PLAY_HISTORY === "undefined") return;
      var d = PLAY_HISTORY;
      function games(list) {
        return '<dl class="rows rows-num">' + list.map(function (g, i) {
          var name = g[1] ? '<a href="' + esc(g[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(g[0]) + " ↗</a>" : esc(g[0]);
          return row(String(i + 1).padStart(2, "0"),
            "<strong>" + name + '</strong><span class="sub block"><span class="num" style="font-size:14px">' + esc(g[2]) + "</span> · " + esc(g[3]) + "</span>" +
            '<span class="sub block">' + esc(g[4]) + "</span>");
        }).join("") + "</dl>";
      }
      el.innerHTML =
        comp("PC (Steam)", games(d.pc) + '<p class="comp-note">' + esc(d.pcNote) + '<br><a href="' + esc(d.steamProfile) + '" target="_blank" rel="noopener noreferrer">Steam 프로필에서 전체 목록 보기 ↗</a></p>', { badge: d.pc.length + "종" }) +
        comp("Mobile", games(d.mobile), { badge: d.mobile.length + "종", collapsed: true }) +
        comp("Data Source", '<ul class="list list-pad">' + d.mobileNote.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>", { collapsed: true });
    },
    "study-scene": function (el) {
      if (typeof STUDY_PLAN === "undefined") return;
      var s = studySummary();
      el.innerHTML =
        '<p class="hero-desc">선정 이유: ' + esc(STUDY_PLAN.reason) + ". 이론과 실습, 응용으로 나눠 실제로 배운 것을 직접 해 보는 데 집중합니다.</p>" +
        '<div class="progress"><div class="progress-top"><span>전체 진행률</span><span class="progress-pct">' + s.pct + "%</span></div>" +
        '<div class="progress-track" role="img" aria-label="진행률 ' + s.pct + '%"><span style="width:' + s.pct + '%"></span></div></div>' +
        '<dl class="hero-stats">' +
          "<div><dt>완료 단원</dt><dd>" + s.done + " / " + s.total + "</dd></div>" +
          "<div><dt>누적 공부 시간</dt><dd>" + s.minutes.toLocaleString() + "분</dd></div>" +
          "<div><dt>시작일</dt><dd>" + esc(s.start || "—") + "</dd></div>" +
        "</dl>";
    },
    "study-inspector": function (el) {
      if (typeof STUDY_PLAN === "undefined") return;
      var p = STUDY_PLAN;
      var log = typeof STUDY_LOG === "undefined" ? {} : STUDY_LOG;
      var html = comp("Plan",
        '<dl class="rows">' +
          row("책", esc(p.book)) +
          row("마음가짐", p.mindset.map(esc).join("<br>")) +
          row("목표", esc(p.goal)) +
          row("느낌 상상하기", esc(p.feeling)) +
          row("보상", esc(p.reward)) +
        "</dl>");
      var openedOne = false;
      p.chapters.forEach(function (ch) {
        var done = ch[1].filter(function (t) { var r = log[lessonKey(t)]; return r && r.date; }).length;
        // 아직 끝나지 않은 첫 챕터만 펼쳐 둔다
        var open = !openedOne && done < ch[1].length;
        if (open) openedOne = true;
        var rows = ch[1].map(function (title) {
          var r = log[lessonKey(title)] || {};
          var meta = [];
          if (r.date) meta.push(esc(r.date));
          if (r.theory) meta.push("이론 " + r.theory + "분");
          if (r.practice) meta.push("실습 " + r.practice + "분");
          if (r.apply) meta.push("응용 " + r.apply + "분");
          if (r.youtube) meta.push('<a href="' + esc(r.youtube) + '" target="_blank" rel="noopener noreferrer">유튜브 ↗</a>');
          var name = title.slice(lessonKey(title).length + 1);
          return '<div class="row"><dt><span class="check' + (r.date ? " is-on" : "") + '" role="img" aria-label="' + (r.date ? "완료" : "예정") + '">' +
            (r.date ? "✓" : "") + "</span>" + esc(lessonKey(title)) + "</dt><dd>" + esc(name) +
            (r.note ? '<span class="sub block">' + esc(r.note) + "</span>" : "") +
            (meta.length ? '<span class="sub block">' + meta.join(" · ") + "</span>" : "") + "</dd></div>";
        }).join("");
        html += comp(ch[0], '<dl class="rows">' + rows + "</dl>", { badge: done + " / " + ch[1].length, collapsed: !open });
      });
      el.innerHTML = html;
    }
  };

  function lessonKey(title) { return title.split(" ")[0]; }
  function studySummary() {
    var log = typeof STUDY_LOG === "undefined" ? {} : STUDY_LOG;
    var total = 0, done = 0, minutes = 0, dates = [];
    STUDY_PLAN.chapters.forEach(function (ch) {
      ch[1].forEach(function (t) {
        total++;
        var r = log[lessonKey(t)];
        if (!r) return;
        if (r.date) { done++; dates.push(r.date); }
        minutes += (r.theory || 0) + (r.practice || 0) + (r.apply || 0);
      });
    });
    dates.sort();
    return { total: total, done: done, minutes: minutes, start: dates[0], pct: total ? Math.round(done / total * 1000) / 10 : 0 };
  }

  /* =========================================================
     Scene: 여러 장면이 있으면 탭으로 전환
     ========================================================= */
  function setupShots(root) {
    var box = root.querySelector(".shots");
    if (!box) return;
    var figs = Array.prototype.slice.call(box.querySelectorAll(".shot"));
    figs.forEach(function (f, i) { f.hidden = i !== 0; });
    if (figs.length < 2) return;
    var tabs = document.createElement("div");
    tabs.className = "shot-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "장면 선택");
    figs.forEach(function (f, i) {
      var cap = f.querySelector("figcaption");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "shot-tab";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", i === 0 ? "true" : "false");
      b.textContent = String(i + 1).padStart(2, "0") + "  " + (cap ? cap.textContent : "장면 " + (i + 1));
      b.addEventListener("click", function () {
        figs.forEach(function (g, j) { g.hidden = j !== i; });
        tabs.querySelectorAll(".shot-tab").forEach(function (t, j) { t.setAttribute("aria-selected", j === i ? "true" : "false"); });
        syncPlayBtn();
      });
      tabs.appendChild(b);
    });
    box.insertBefore(tabs, box.firstChild);
  }

  /* =========================================================
     ▶ 재생 / 일시정지 (GIF)
     ========================================================= */
  function activeGif() {
    var img = sceneView.querySelector(".shot:not([hidden]) img");
    return img && /\.gif($|\?)/i.test(img.getAttribute("src")) ? img : null;
  }
  function isPaused(img) { return img.getAttribute("data-paused") === "true"; }

  function freeze(img) {
    if (!img.complete || !img.naturalWidth) {
      img.addEventListener("load", function () { freeze(img); }, { once: true });
      img.setAttribute("data-paused", "true");
      return;
    }
    var c = img.nextElementSibling && img.nextElementSibling.tagName === "CANVAS" ? img.nextElementSibling : document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    c.setAttribute("role", "img");
    c.setAttribute("aria-label", img.alt + " (일시정지)");
    if (!c.parentNode) img.parentNode.insertBefore(c, img.nextSibling);
    img.hidden = true;
    img.setAttribute("data-paused", "true");
  }
  function resume(img) {
    var c = img.nextElementSibling;
    if (c && c.tagName === "CANVAS") c.remove();
    img.hidden = false;
    img.setAttribute("data-paused", "false");
  }

  function syncPlayBtn() {
    var img = activeGif();
    playBtn.disabled = !img;
    var playing = img && !isPaused(img);
    playBtn.classList.toggle("is-playing", !!playing);
    playBtn.querySelector(".play-icon").textContent = playing ? "❚❚" : "▶";
    playBtn.setAttribute("aria-label", !img ? "재생할 영상 없음" : playing ? "Scene 영상 일시정지" : "Scene 영상 재생");
  }
  playBtn.addEventListener("click", function () {
    var img = activeGif();
    if (!img) return;
    if (isPaused(img)) resume(img); else freeze(img);
    syncPlayBtn();
  });

  /* =========================================================
     Console
     ========================================================= */
  function renderConsole(key) {
    var tpl = consoleTemplates[key];
    consoleView.innerHTML = "";
    if (!tpl) {
      consoleView.innerHTML = '<p class="console-empty">표시할 로그가 없습니다.</p>';
      consoleCount.textContent = "0";
      return;
    }
    var ul = document.createElement("ul");
    ul.className = "logs";
    ul.appendChild(tpl.content.cloneNode(true));
    consoleView.appendChild(ul);
    consoleCount.textContent = "⚠ " + ul.querySelectorAll(".log").length;
  }
  consoleView.addEventListener("click", function (e) {
    var head = e.target.closest(".log-head");
    if (!head) return;
    var open = head.getAttribute("aria-expanded") !== "true";
    head.setAttribute("aria-expanded", open ? "true" : "false");
    head.nextElementSibling.hidden = !open;
  });

  /* =========================================================
     항목 선택
     ========================================================= */
  function render(id) {
    var tpl = templates[id];
    var li = itemById(id);
    var frag = tpl.content.cloneNode(true);
    var scene = frag.querySelector('[data-slot="scene"]');
    var insp = frag.querySelector('[data-slot="inspector"]');

    [scene, insp].forEach(function (slot) {
      if (!slot) return;
      if (slot.hasAttribute("data-render")) renderers[slot.getAttribute("data-render")](slot);
      slot.querySelectorAll("[data-render]").forEach(function (el) { renderers[el.getAttribute("data-render")](el); });
    });

    sceneView.innerHTML = "";
    if (scene) while (scene.firstChild) sceneView.appendChild(scene.firstChild);
    setupShots(sceneView);
    sceneView.scrollTop = 0;

    inspectorView.innerHTML = '<div class="obj-head"><span class="obj-name">' + esc(labelOf(li)) + '</span><span class="obj-path">' + esc(pathOf(li)) + "</span></div>";
    if (insp) while (insp.firstChild) inspectorView.appendChild(insp.firstChild);
    setupComps(inspectorView);
    inspectorView.scrollTop = 0;

    renderConsole(tpl.getAttribute("data-console"));
    scenePath.textContent = pathOf(li);

    if (reduceMotion) sceneView.querySelectorAll(".shot img").forEach(function (img) {
      if (/\.gif($|\?)/i.test(img.getAttribute("src"))) freeze(img);
    });
    syncPlayBtn();
  }

  var views = [sceneView, inspectorView, consoleView];
  var fadeTimer = null;
  function select(id) {
    if (!templates[id]) id = DEFAULT_ID;
    if (id === currentId) return;
    var first = currentId === null;
    currentId = id;

    var li = itemById(id);
    treeItems.forEach(function (t) { t.setAttribute("aria-selected", t === li ? "true" : "false"); });
    // 접혀 있는 부모는 펼친다
    for (var p = parentItem(li); p; p = parentItem(p)) p.setAttribute("aria-expanded", "true");
    setFocusable(li);
    // 모바일 가로 탭에서 선택 항목이 보이게
    var rowEl = li.querySelector(".tree-row");
    if (rowEl.scrollIntoView && !first) rowEl.scrollIntoView({ block: "nearest", inline: "nearest" });

    clearTimeout(fadeTimer);
    if (first || reduceMotion) { render(id); return; }
    views.forEach(function (v) { v.classList.add("is-fading"); });
    fadeTimer = setTimeout(function () {
      render(id);
      views.forEach(function (v) { v.classList.remove("is-fading"); });
    }, FADE_MS);
  }

  function idFromHash() { return decodeURIComponent(location.hash.slice(1)) || DEFAULT_ID; }
  function navigate(id) {
    if (idFromHash() === id && currentId === id) return;
    location.hash = id; // hashchange에서 select. 히스토리에 남아 뒤로 가기가 동작
  }
  window.addEventListener("hashchange", function () { select(idFromHash()); });

  /* =========================================================
     Hierarchy: 마우스 · 키보드 (ARIA tree)
     ========================================================= */
  function setFocusable(li) {
    treeItems.forEach(function (t) { t.tabIndex = t === li ? 0 : -1; });
  }
  function isMobile() { return window.matchMedia("(max-width: 768px)").matches; }
  function visibleItems() {
    return treeItems.filter(function (t) {
      if (isMobile()) return true;
      for (var p = parentItem(t); p; p = parentItem(p)) if (p.getAttribute("aria-expanded") === "false") return false;
      return true;
    });
  }
  function toggle(li, open) {
    if (!group(li)) return;
    li.setAttribute("aria-expanded", open ? "true" : "false");
  }

  tree.addEventListener("click", function (e) {
    var li = e.target.closest('[role="treeitem"]');
    if (!li) return;
    if (e.target.closest(".tree-toggle") && group(li)) {
      toggle(li, li.getAttribute("aria-expanded") !== "true");
      setFocusable(li);
      li.focus();
      return;
    }
    setFocusable(li);
    li.focus({ preventScroll: true });
    navigate(li.getAttribute("data-item"));
  });

  tree.addEventListener("keydown", function (e) {
    var li = e.target.closest('[role="treeitem"]');
    if (!li) return;
    var list = visibleItems();
    var i = list.indexOf(li);
    var next = null;
    var horizontal = isMobile();
    switch (e.key) {
      case "ArrowDown": next = list[i + 1]; break;
      case "ArrowUp": next = list[i - 1]; break;
      case "ArrowRight":
        if (horizontal) next = list[i + 1];
        else if (group(li) && li.getAttribute("aria-expanded") === "false") toggle(li, true);
        else if (group(li)) next = group(li).querySelector('[role="treeitem"]');
        break;
      case "ArrowLeft":
        if (horizontal) next = list[i - 1];
        else if (group(li) && li.getAttribute("aria-expanded") === "true") toggle(li, false);
        else next = parentItem(li);
        break;
      case "Home": next = list[0]; break;
      case "End": next = list[list.length - 1]; break;
      case "Enter":
      case " ":
        navigate(li.getAttribute("data-item"));
        break;
      default: return;
    }
    e.preventDefault();
    if (next) { setFocusable(next); next.focus(); }
  });

  // 시작: 해시가 가리키는 항목(없으면 Intro)
  select(idFromHash());
})();
