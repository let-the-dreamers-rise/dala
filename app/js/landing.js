// Landing motion. Everything here enhances content that is already readable without JS.
import { heroTimeline, heroStill, heroDepth } from "./hero.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const ENTRANCES = [".split", ".tile", ".calc-form, .calc-out", ".stats > div", ".faq details", ".cta p, .cta .btn"];
const money = (n) => "$" + Math.round(n).toLocaleString("en-US");

function wireStatic() {
  // Nav border once the page scrolls.
  const nav = $(".nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Before/after slider.
  const split = $("#split");
  $("#split-range").addEventListener("input", (e) => split.style.setProperty("--pos", `${e.target.value}%`));

  // Pause looping tile animations while offscreen.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => en.target.classList.toggle("paused", !en.isIntersecting));
  });
  $$(".tile, .marquee").forEach((t) => io.observe(t));
}

function calculator(gsap) {
  const ids = ["save", "match", "years", "pay"];
  const shown = { total: 0, month: 0 };
  const render = (animate) => {
    const v = Object.fromEntries(ids.map((k) => [k, Number($(`#c-${k}`).value)]));
    $("#o-save").textContent = money(v.save);
    $("#o-match").textContent = `${v.match}%`;
    $("#o-years").textContent = String(v.years);
    $("#o-pay").textContent = String(v.pay);
    const total = v.save * (1 + v.match / 100) * 12 * v.years;
    const month = total / (v.pay * 12);
    const paint = () => {
      $("#r-total").textContent = money(shown.total);
      $("#r-month").textContent = money(shown.month);
    };
    if (animate && gsap) {
      gsap.to(shown, { total, month, duration: 0.6, ease: "power3.inOut", overwrite: true, onUpdate: paint });
    } else {
      Object.assign(shown, { total, month });
      paint();
    }
  };
  ids.forEach((k) => $(`#c-${k}`).addEventListener("input", () => render(true)));
  render(false);
}

function motion(gsap) {
  const { ScrollTrigger, SplitText } = window;
  gsap.registerPlugin(ScrollTrigger, SplitText, MotionPathPlugin);
  const mm = gsap.matchMedia();

  mm.add("(prefers-reduced-motion: reduce)", () => heroStill(gsap));

  mm.add("(prefers-reduced-motion: no-preference)", () => {
    // Masked line reveals on every headline. Hero plays on load, the rest on scroll.
    $$(".reveal-lines").forEach((h, i) => {
      SplitText.create(h, {
        type: "lines", mask: "lines", autoSplit: true,
        onSplit: (self) => gsap.from(self.lines, {
          yPercent: 110, duration: 1, ease: "power4.out", stagger: 0.1,
          scrollTrigger: i === 0 ? undefined : { trigger: h, start: "top 85%", once: true },
        }),
      });
    });
    gsap.from([".hero .eyebrow", ".hero-lede", ".hero-cta", ".hero .fine"], { y: 24, opacity: 0, duration: 0.9, ease: "expo.out", stagger: 0.08, delay: 0.25 });
    gsap.from("#hero-stage", { y: 40, opacity: 0, duration: 1.2, ease: "expo.out", delay: 0.2 });

    const tl = heroTimeline(gsap);
    ScrollTrigger.create({ trigger: "#hero-stage", start: "top bottom", end: "bottom top", onToggle: (st) => tl.paused(!st.isActive) });
    heroDepth(gsap);

    // Staggered entrances, pulled into place then settled.
    ENTRANCES.forEach((sel) => {
      gsap.set(sel, { y: 28, opacity: 0 });
      ScrollTrigger.batch(sel, {
        start: "top 88%", once: true,
        onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: 0.9, ease: "expo.out", stagger: 0.08 }),
      });
    });

    // Count-ups.
    $$(".count").forEach((el) => {
      const to = Number(el.dataset.to);
      const dec = Number(el.dataset.dec || 0);
      const o = { v: 0 };
      gsap.to(o, {
        v: to, duration: 1.6, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
        onUpdate: () => { el.textContent = o.v.toFixed(dec); },
      });
    });

    // Footer thread pulls taut when it arrives.
    gsap.from(".foot-thread path", { scaleX: 0, transformOrigin: "0% 50%", duration: 1.4, ease: "power3.inOut", scrollTrigger: { trigger: ".foot", start: "top 95%", once: true } });

    // FAQ answers settle in when opened.
    $$(".faq details").forEach((d) => d.addEventListener("toggle", () => {
      if (d.open) gsap.from(d.querySelector("p"), { y: -8, opacity: 0, duration: 0.45, ease: "expo.out" });
    }));
  });

  // Pinned, scrubbed story on wide screens; simple step activation on narrow ones.
  const steps = $$(".step");
  const setActive = (idx) => steps.forEach((s, i) => s.classList.toggle("active", i === idx));
  mm.add("(min-width: 901px) and (prefers-reduced-motion: no-preference)", () => {
    ScrollTrigger.create({
      trigger: ".story", pin: ".story-pin", start: "top top", end: "+=1500", scrub: 0.6,
      onUpdate: (st) => {
        gsap.set("#story-progress", { scaleX: st.progress });
        setActive(Math.min(steps.length - 1, Math.floor(st.progress * steps.length)));
      },
    });
  });
  mm.add("(max-width: 900px), (prefers-reduced-motion: reduce)", () => {
    steps.forEach((s, i) => ScrollTrigger.create({
      trigger: s, start: "top 70%", end: "bottom 40%",
      onToggle: (st) => { if (st.isActive) { setActive(i); gsap.set("#story-progress", { scaleX: (i + 1) / steps.length }); } },
    }));
  });
}

wireStatic();
const gsap = window.gsap;
calculator(gsap);
if (gsap && window.ScrollTrigger && window.SplitText && window.MotionPathPlugin) {
  motion(gsap);
  // Failsafe: if the browser is not producing animation frames (background tab, link-preview
  // renderer, screenshot bot), finish every animation so the page is complete at rest.
  setTimeout(() => {
    if (gsap.ticker.time < 0.5) {
      gsap.globalTimeline.getChildren(true, true, false).forEach((t) => t.progress(1));
      gsap.set(ENTRANCES.join(", "), { y: 0, opacity: 1 });
    }
  }, 2000);
} else {
  // CDN blocked: the page stays fully readable, with the woven thread shown still.
  const reveal = document.getElementById("thread-reveal");
  if (reveal) reveal.setAttribute("width", "560");
}
