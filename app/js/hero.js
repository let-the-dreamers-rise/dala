// Hero: four scattered payments are pulled onto one thread, carried across borders,
// and released as monthly payouts at home. Thread physics: pull taut, then settle.
const PULL = "power3.inOut";
const SETTLE = "expo.out";

export function heroTimeline(gsap) {
  const stage = document.getElementById("hero-stage");
  const state = document.getElementById("stage-state");
  const coins = gsap.utils.toArray(".coin", stage);
  const labels = gsap.utils.toArray(".coin text", stage);
  const drops = gsap.utils.toArray(".drop", stage);
  const reveal = document.getElementById("thread-reveal");
  const say = (t) => () => { state.textContent = t; };

  gsap.set(reveal, { scaleX: 0, transformOrigin: "0% 50%" });
  const start = coins.map((c) => ({ x: gsap.getProperty(c, "x"), y: gsap.getProperty(c, "y") }));

  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, defaults: { ease: PULL } });
  tl.call(say("Scattered"))
    // Unconnected payments drift: a lump sum here, a promise there.
    .to(coins, { x: (i) => start[i].x + gsap.utils.random(-14, 14), y: (i) => start[i].y + gsap.utils.random(-10, 10), duration: 1.1, ease: "sine.inOut", stagger: 0.08 })
    .call(say("Gathering"))
    .to(labels, { opacity: 0, duration: 0.3 }, "<0.6")
    .to(coins, { x: 40, y: 120, duration: 0.9, stagger: 0.12 })
    .call(say("One thread"))
    .to(reveal, { scaleX: 1, duration: 2.2, ease: PULL }, "weave")
    .to(coins, {
      motionPath: { path: "#thread", align: "#thread", alignOrigin: [0.5, 0.5] },
      duration: 2.2, stagger: 0.14, ease: PULL,
    }, "weave")
    .to(coins, { scale: 0, duration: 0.35, stagger: 0.14, ease: "back.in(2)" }, "weave+=2.0")
    .fromTo(".home circle", { scale: 1 }, { scale: 1.5, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: "50% 50%", ease: SETTLE }, "<0.2")
    .call(say("Paid monthly at home"))
    .fromTo(drops, { y: 0, opacity: 1 }, { y: 64, opacity: 0, duration: 0.9, stagger: 0.45, ease: "power2.in" })
    .to({}, { duration: 0.6 })
    // Reset for the next loop.
    .to(reveal, { scaleX: 0, duration: 0.6, transformOrigin: "100% 50%" })
    .set(reveal, { transformOrigin: "0% 50%" })
    .set(coins, { x: (i) => start[i].x, y: (i) => start[i].y, rotation: 0 })
    .to(coins, { scale: 1, duration: 0.5, stagger: 0.06, ease: SETTLE })
    .to(labels, { opacity: 1, duration: 0.3 }, "<");
  return tl;
}

/** Static final frame for reduced motion: the woven thread with nothing moving. */
export function heroStill(gsap) {
  gsap.set("#thread-reveal", { scaleX: 1 });
  document.getElementById("stage-state").textContent = "One thread";
}

/** Cursor-reactive depth: layers shift by their data-depth. */
export function heroDepth(gsap) {
  const stage = document.getElementById("hero-stage");
  const layers = gsap.utils.toArray(".depth", stage).map((el) => ({
    d: Number(el.dataset.depth) || 0.5,
    x: gsap.quickTo(el, "x", { duration: 0.8, ease: SETTLE }),
    y: gsap.quickTo(el, "y", { duration: 0.8, ease: SETTLE }),
  }));
  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    layers.forEach((l) => { l.x(nx * 18 * l.d); l.y(ny * 14 * l.d); });
  });
  stage.addEventListener("pointerleave", () => layers.forEach((l) => { l.x(0); l.y(0); }));
}
