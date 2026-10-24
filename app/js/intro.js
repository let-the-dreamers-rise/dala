// First-visit walkthrough: the problem, what Dala does, and the steps ahead. Shown once per browser.
import { $ } from "./ui.js";

const SEEN = "dala.introSeen";

export function introSeen() {
  try { return localStorage.getItem(SEEN) === "1"; } catch { return false; }
}
function markSeen() {
  try { localStorage.setItem(SEEN, "1"); } catch { /* storage blocked: intro shows again next visit */ }
}

/** Show the intro; resolves when the visitor finishes or skips it. */
export function runIntro() {
  const root = $("intro");
  const slides = [...root.querySelectorAll(".intro-slide")];
  const dots = [...$("intro-dots").children];
  const back = $("intro-back");
  const next = $("intro-next");
  const skip = $("intro-skip");
  let at = 0;

  const show = (i) => {
    at = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, j) => { s.hidden = j !== at; });
    dots.forEach((d, j) => d.classList.toggle("on", j <= at));
    back.disabled = at === 0;
    const last = at === slides.length - 1;
    next.textContent = last ? "Create my wallet" : "Next";
    skip.hidden = last;
    slides[at].classList.remove("enter");
    void slides[at].offsetWidth; // restart the entrance animation
    slides[at].classList.add("enter");
  };

  root.hidden = false;
  show(0);
  next.focus();

  return new Promise((resolve) => {
    const done = () => {
      markSeen();
      root.hidden = true;
      back.onclick = next.onclick = skip.onclick = root.onkeydown = null;
      resolve();
    };
    back.onclick = () => show(at - 1);
    next.onclick = () => (at === slides.length - 1 ? done() : show(at + 1));
    skip.onclick = done;
    root.onkeydown = (e) => {
      if (e.key === "ArrowRight") show(at + 1);
      if (e.key === "ArrowLeft") show(at - 1);
    };
  });
}
