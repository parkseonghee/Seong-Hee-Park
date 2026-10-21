/* 필름 스트립 첫 화면
   - TV 켜짐 효과가 끝나면 덮개를 지운다
   - 배경 reel(로그타워 · ZooJack)을 8초마다 교차 페이드로 바꿔 가며 재생
   - reel마다 webm → mp4 순서로 영상을 시도하고, 둘 다 안 되면 GIF로 대체
   - 움직임 줄이기 설정이면 영상·GIF를 불러오지 않고 첫 번째 poster만 둔다
   - 화면 밖으로 스크롤되거나 다른 탭으로 가면 일시정지 (IntersectionObserver) */
(function () {
  "use strict";

  var tv = document.querySelector(".tv-on");
  if (tv) tv.addEventListener("animationend", function (e) { if (e.target === tv) tv.remove(); });

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  var SWITCH_MS = 8000;
  var FADE_MS = 1000; // .reel 교차 페이드 시간과 같게

  var frame = document.querySelector(".film-frame");
  var reels = Array.prototype.slice.call(frame.querySelectorAll(".reel"));
  var label = document.getElementById("reelName");
  var index = 0;
  var visible = true;
  var timer = null;

  /* ---------- reel 하나의 재생 ---------- */
  function setup(reel) {
    if (reel._mode) return;
    var srcs = [["webm", "video/webm"], ["mp4", "video/mp4"]].filter(function (s) { return reel.getAttribute("data-" + s[0]); });
    if (!srcs.length) { toGif(reel); return; }
    reel._mode = "video";
    var video = document.createElement("video");
    video.muted = true; video.loop = true; video.playsInline = true;
    video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
    video.setAttribute("aria-hidden", "true"); video.tabIndex = -1;
    video.preload = "auto";
    srcs.forEach(function (s, i) {
      var source = document.createElement("source");
      source.type = s[1];
      // 마지막 source까지 실패하면 GIF로
      if (i === srcs.length - 1) source.addEventListener("error", function () { toGif(reel); });
      source.src = reel.getAttribute("data-" + s[0]);
      video.appendChild(source);
    });
    video.addEventListener("error", function () { toGif(reel); });
    video.addEventListener("playing", function () { video.classList.add("is-on"); });
    reel.appendChild(video);
    reel._video = video;
  }

  function toGif(reel) {
    if (reel._mode === "gif") return;
    reel._mode = "gif";
    if (reel._video) { reel._video.remove(); reel._video = null; }
    var src = reel.getAttribute("data-gif");
    if (!src) return; // poster만 남는다
    var img = document.createElement("img");
    img.className = "reel-gif";
    img.alt = "";
    img.hidden = true;
    img.addEventListener("load", function () { img.classList.add("is-on"); }, { once: true });
    reel.appendChild(img);
    reel._gif = img;
    img.src = src;
    if (reel._playing) img.hidden = false;
  }

  function play(reel) {
    setup(reel);
    reel._playing = true;
    if (reel._mode === "video" && reel._video) {
      var p = reel._video.play();
      if (p && p.catch) p.catch(function () { /* 자동 재생이 막히면 poster가 그대로 보인다 */ });
    } else if (reel._gif) {
      reel._gif.hidden = false;
    }
  }

  // GIF는 멈출 수 없으므로 숨겨서 그리기 비용을 없앤다
  function pause(reel) {
    reel._playing = false;
    if (reel._video) reel._video.pause();
    if (reel._gif) reel._gif.hidden = true;
  }

  /* ---------- reel 전환 ---------- */
  function show(next) {
    if (next === index) return;
    var prev = reels[index];
    index = next;
    var cur = reels[index];
    play(cur);
    cur.classList.add("is-active");
    prev.classList.remove("is-active");
    if (label) label.textContent = cur.getAttribute("data-name");
    // 페이드가 끝난 뒤 이전 reel을 멈춘다
    setTimeout(function () { if (reels[index] !== prev) pause(prev); }, FADE_MS);
  }

  function start() {
    play(reels[index]);
    clearInterval(timer);
    if (reels.length > 1) timer = setInterval(function () { show((index + 1) % reels.length); }, SWITCH_MS);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    reels.forEach(pause);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }, { threshold: 0.05 }).observe(frame);
  } else {
    start();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else if (visible) start();
  });
})();
