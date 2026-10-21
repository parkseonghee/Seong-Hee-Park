/* 박성희 포트폴리오
   - 스크롤 등장 연출 (.reveal): 화면에 처음 들어올 때 한 번만
   - 게임 플레이 이력 · 공부 계획은 js/records.js 데이터로 화면을 그림
   - 프로젝트 카드를 누르면 상세(dialog)가 열림. 주소에 #roguetower 같은 해시가 붙어
     뒤로 가기로 닫히고, 해시가 붙은 주소로 들어오면 바로 열린다 */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var motion = !reduceMotion && "IntersectionObserver" in window;

  /* ---------- 이미지를 못 불러오면 빈칸 표시 ---------- */
  document.querySelectorAll(".shot img").forEach(function (img) {
    function missing() { img.closest(".shot").classList.add("is-missing"); }
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) missing();
    img.addEventListener("error", missing);
  });

  /* ---------- 내비게이션: 스크롤하면 아래 구분선 ---------- */
  var nav = document.querySelector(".nav");
  function onScroll() { nav.classList.toggle("is-scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- 스크롤 등장 ---------- */
  if (motion) {
    root.classList.add("motion");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting && e.boundingClientRect.top > 0) return;
        e.target.classList.add("play");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function stat(label, value, sub) {
    return '<div class="page-stat"><p class="page-stat-label">' + esc(label) + '</p><p class="page-stat-value">' +
      esc(value) + "</p>" + (sub ? '<p class="page-stat-sub">' + esc(sub) + "</p>" : "") + "</div>";
  }

  /* ---------- 게임 플레이 이력 ---------- */
  // "121.4시간", "119분", "2026.07 ~ 2026.09 (89.0시간 / 37일)" → 분. 시간 기록이 없으면 0
  function toMinutes(text) {
    var h = /([\d.]+)시간/.exec(text);
    if (h) return parseFloat(h[1]) * 60;
    var m = /(\d+)분/.exec(text);
    return m ? parseInt(m[1], 10) : 0;
  }
  function isRoguelike(genre) { return /로그라이[크트]/.test(genre); }

  function initPlayHistory() {
    if (typeof PLAY_HISTORY === "undefined") return;
    var data = PLAY_HISTORY;
    var list = document.getElementById("phList");
    var empty = document.getElementById("phEmpty");
    var note = document.getElementById("phNote");
    var search = document.getElementById("phSearch");
    var more = document.getElementById("phMore");
    var tabs = document.querySelectorAll("#play-history .seg-btn");
    var platform = "pc";
    var LIMIT = 10;      // 메인 페이지가 너무 길어지지 않게 처음엔 10개만
    var showAll = false;

    var pcMinutes = data.pc.reduce(function (sum, g) { return sum + toMinutes(g[2]); }, 0);
    var rogueCount = data.pc.concat(data.mobile).filter(function (g) { return isRoguelike(g[3]); }).length;
    document.getElementById("phStats").innerHTML =
      stat("PC (Steam)", data.pc.length + "종", "누적 약 " + Math.round(pcMinutes / 60) + "시간") +
      stat("모바일", data.mobile.length + "종", "Play 게임즈 기록 153종 중 상위") +
      stat("로그라이크 계열", rogueCount + "종", "로그타워 개발에 직접 참고");

    function render() {
      var games = data[platform];
      var q = search.value.trim().toLowerCase();
      var max = games.reduce(function (m, g) { return Math.max(m, toMinutes(g[2])); }, 1);
      var html = "";
      var shown = 0, matched = 0;
      games.forEach(function (g, i) {
        if (q && (g[0] + " " + g[3]).toLowerCase().indexOf(q) === -1) return;
        matched++;
        // 검색 중에는 찾은 결과를 모두 보여 준다
        if (!q && !showAll && shown >= LIMIT) return;
        shown++;
        var name = g[1]
          ? '<a href="' + esc(g[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(g[0]) + " ↗</a>"
          : esc(g[0]);
        var bar = platform === "pc"
          ? '<span class="game-bar" aria-hidden="true"><span style="width:' + Math.max(2, toMinutes(g[2]) / max * 100).toFixed(1) + '%"></span></span>'
          : "";
        html += '<li class="game' + (i < 3 ? " is-top" : "") + '">' +
          '<span class="game-rank">' + (i + 1) + "</span>" +
          '<div class="game-main">' +
            '<div class="game-head"><h3 class="game-name">' + name + "</h3>" +
              '<span class="game-genre' + (isRoguelike(g[3]) ? " is-rogue" : "") + '">' + esc(g[3]) + "</span></div>" +
            '<p class="game-time">' + esc(g[2]) + "</p>" + bar +
            '<p class="game-desc">' + esc(g[4]) + "</p>" +
          "</div></li>";
      });
      list.innerHTML = html;
      empty.hidden = html !== "";
      more.hidden = shown >= matched;
      more.textContent = "더 보기 (" + (matched - shown) + "개 더)";
      note.innerHTML = platform === "pc"
        ? "<p>" + esc(data.pcNote) + '</p><p><a href="' + esc(data.steamProfile) + '" target="_blank" rel="noopener noreferrer">Steam 프로필에서 전체 목록 보기 ↗</a></p>'
        : "<ul>" + data.mobileNote.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>";
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        platform = tab.getAttribute("data-platform");
        showAll = false;
        tabs.forEach(function (t) { t.setAttribute("aria-selected", t === tab ? "true" : "false"); });
        render();
      });
    });
    search.addEventListener("input", render);
    more.addEventListener("click", function () { showAll = true; render(); });
    render();
  }
  initPlayHistory();

  /* ---------- 공부 계획 ---------- */
  function initStudyPlan() {
    if (typeof STUDY_PLAN === "undefined") return;
    var plan = STUDY_PLAN;
    var log = typeof STUDY_LOG === "undefined" ? {} : STUDY_LOG;
    function key(title) { return title.split(" ")[0]; }
    function minutesOf(r) { return (r.theory || 0) + (r.practice || 0) + (r.apply || 0); }

    var total = 0, done = 0, minutes = 0, dates = [];
    plan.chapters.forEach(function (ch) {
      ch[1].forEach(function (title) {
        total++;
        var r = log[key(title)];
        if (r && r.date) { done++; dates.push(r.date); }
        if (r) minutes += minutesOf(r);
      });
    });
    var pct = total ? Math.round(done / total * 1000) / 10 : 0;
    dates.sort();

    document.getElementById("spLead").textContent = "선정 이유: " + plan.reason + ". 이론과 실습, 응용으로 나눠 실제로 배운 것을 직접 해 보는 데 집중합니다.";
    document.getElementById("spPct").textContent = pct + "%";
    document.getElementById("spFill").style.width = pct + "%";
    document.getElementById("spStats").innerHTML =
      stat("완료 단원", done + " / " + total) +
      stat("누적 공부 시간", minutes.toLocaleString() + "분") +
      stat("시작일", dates[0] || "—");

    document.getElementById("spCards").innerHTML =
      '<div class="box plan-card"><p class="plan-label">마음가짐</p><p class="plan-quote">' + plan.mindset.map(esc).join("<br>") + "</p></div>" +
      '<div class="box plan-card"><p class="plan-label">목표</p><p class="plan-big">' + esc(plan.goal) + "</p>" +
        '<p class="plan-sub">느낌 상상하기 · ' + esc(plan.feeling) + "</p></div>" +
      '<div class="box plan-card plan-reward"><p class="plan-label">완독 보상</p><p class="plan-big">🎉 ' + esc(plan.reward) + "</p></div>";

    var firstOpen = false;
    var html = "";
    plan.chapters.forEach(function (ch) {
      var items = ch[1];
      var chDone = items.filter(function (t) { var r = log[key(t)]; return r && r.date; }).length;
      // 아직 끝나지 않은 첫 챕터를 펼쳐 둔다
      var open = !firstOpen && chDone < items.length;
      if (open) firstOpen = true;
      html += '<details class="chapter' + (chDone === items.length ? " is-done" : "") + '"' + (open ? " open" : "") + ">" +
        "<summary>" +
          '<span class="chapter-title">' + esc(ch[0]) + "</span>" +
          '<span class="chapter-count">' + chDone + " / " + items.length + "</span>" +
          '<span class="chapter-bar" aria-hidden="true"><span style="width:' + (chDone / items.length * 100) + '%"></span></span>' +
        "</summary><ul class=\"lessons\">";
      items.forEach(function (title) {
        var r = log[key(title)] || {};
        var isDone = !!r.date;
        var meta = [];
        if (r.date) meta.push(esc(r.date));
        if (r.theory) meta.push("이론 " + r.theory + "분");
        if (r.practice) meta.push("실습 " + r.practice + "분");
        if (r.apply) meta.push("응용 " + r.apply + "분");
        if (r.youtube) meta.push('<a href="' + esc(r.youtube) + '" target="_blank" rel="noopener noreferrer">유튜브 ↗</a>');
        html += '<li class="lesson' + (isDone ? " is-done" : "") + '">' +
          '<span class="lesson-check" aria-label="' + (isDone ? "완료" : "예정") + '"></span>' +
          '<div><p class="lesson-title">' + esc(title) + "</p>" +
          (r.note ? '<p class="lesson-note">' + esc(r.note) + "</p>" : "") +
          (meta.length ? '<p class="lesson-meta">' + meta.join(" · ") + "</p>" : "") +
          "</div></li>";
      });
      html += "</ul></details>";
    });
    var chapters = document.getElementById("spChapters");
    chapters.innerHTML = html;

    document.querySelectorAll("#study-plan [data-expand]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("data-expand") === "true";
        chapters.querySelectorAll("details").forEach(function (d) { d.open = open; });
      });
    });
  }
  initStudyPlan();

  /* ---------- 프로젝트 상세 ---------- */
  var details = {};
  document.querySelectorAll("dialog.detail").forEach(function (d) { details[d.id] = d; });
  var current = null;
  var pushed = false; // 이 페이지에서 해시를 추가했으면 닫을 때 뒤로 가기로 되돌린다

  function hashId() {
    var id = location.hash.slice(1);
    return details[id] ? id : null;
  }

  function show(id) {
    var d = details[id];
    if (!d || current === d) return;
    if (current) current.close();
    current = d;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    d.scrollTop = 0;
    document.body.classList.add("is-locked");
  }

  function hide() {
    if (!current) return;
    var d = current;
    current = null;
    if (d.open) d.close();
    document.body.classList.remove("is-locked");
  }

  // 카드나 "다음 프로젝트" 링크
  document.querySelectorAll("[data-open]").forEach(function (link) {
    link.addEventListener("click", function (e) {
      var id = link.getAttribute("data-open");
      if (!details[id]) return;
      e.preventDefault();
      if (current) history.replaceState(null, "", "#" + id);
      else { history.pushState(null, "", "#" + id); pushed = true; }
      show(id);
    });
  });

  function closeFromUser() {
    if (!current) return;
    hide();
    if (pushed) { pushed = false; history.back(); }
    else history.replaceState(null, "", location.pathname + location.search + "#projects");
  }

  Object.keys(details).forEach(function (id) {
    var d = details[id];
    d.querySelectorAll("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", closeFromUser);
    });
    // Esc 키
    d.addEventListener("cancel", function (e) { e.preventDefault(); closeFromUser(); });
    // 바깥(백드롭) 클릭 — 상세가 화면 전체라 거의 없지만 안전하게
    d.addEventListener("click", function (e) { if (e.target === d) closeFromUser(); });
  });

  // 뒤로/앞으로 가기
  window.addEventListener("popstate", function () {
    var id = hashId();
    if (id) show(id);
    else { pushed = false; hide(); }
  });

  // 해시가 붙은 주소로 바로 들어온 경우
  var initial = hashId();
  if (initial) show(initial);
})();
