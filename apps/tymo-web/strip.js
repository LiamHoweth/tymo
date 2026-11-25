const stripWindow = document.querySelector('.strip-window');
const stripList = stripWindow.querySelector('.strip-list');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const pixelsPerSecond = 36;
let motion;
let travel = 0;

function shuffleBusinesses() {
  const businesses = Array.from(stripList.querySelectorAll('span:not([data-fixed])'));
  for (let i = businesses.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [businesses[i], businesses[j]] = [businesses[j], businesses[i]];
  }
  stripList.append(...businesses);
}

function fitStrip() {
  const distance = Math.max(0, stripList.offsetWidth - stripWindow.clientWidth);
  if (distance === travel && motion && !reducedMotion.matches) return;

  const offset = motion ? Number(motion.currentTime) * pixelsPerSecond / 1000 : stripWindow.scrollLeft;
  motion?.cancel();
  motion = null;
  travel = distance;

  if (reducedMotion.matches || !distance || offset >= distance) {
    stripWindow.removeAttribute('data-moving');
    stripWindow.scrollLeft = offset;
    return;
  }

  stripWindow.scrollLeft = 0;
  stripWindow.setAttribute('data-moving', '');
  motion = stripList.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-' + distance + 'px)' }],
    { duration: distance * 1000 / pixelsPerSecond, easing: 'linear', fill: 'forwards' }
  );
  motion.currentTime = offset * 1000 / pixelsPerSecond;
  motion.onfinish = fitStripAtEnd;
}

function fitStripAtEnd(event) {
  if (event.target !== motion) return;
  motion.cancel();
  motion = null;
  stripWindow.removeAttribute('data-moving');
  stripWindow.scrollLeft = travel;
}

shuffleBusinesses();
const stripSize = new ResizeObserver(fitStrip);
stripSize.observe(stripList);
stripSize.observe(stripWindow);
reducedMotion.addEventListener('change', fitStrip);
fitStrip();
