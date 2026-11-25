(() => {
  const preview = document.querySelector('.px-showcase');
  const choices = preview.querySelector('.px-controls');
  const result = preview.querySelector('.px-result');
  const body = result.querySelector('.px-body');
  const approve = result.querySelector('.sample-approve');
  const photos = Array.from(preview.querySelectorAll('.desk-photo[data-scene]'));
  const fields = Object.fromEntries(
    Array.from(preview.querySelectorAll('[data-booking]'), element => [element.dataset.booking, element])
  );
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const approved = new Set();
  const examples = {
    sport: {
      brand: 'Northside Fields', title: 'Team practice', type: 'Field rental', time: '5:00 PM',
      detail: 'Indoor turf · 60 minutes', size: '1 field', amount: '$90',
    },
    studio: {
      brand: 'Forma Studio', title: 'Morning flow', type: 'Class booking', time: '9:00 AM',
      detail: 'Studio A · 45 minutes', size: '1 spot', amount: '$24',
    },
    salon: {
      brand: 'Juniper Salon', title: 'Cut and finish', type: 'Hair appointment', time: '11:30 AM',
      detail: 'Chair 2 · 60 minutes', size: '1 guest', amount: '$65',
    },
    venue: {
      brand: 'West Hall', title: 'Planning workshop', type: 'Meeting room rental', time: '1:00 PM',
      detail: 'Garden room · 3 hours', size: '12 guests', amount: '$180',
    },
  };
  let selected = choices.querySelector('input:checked').value;
  let transition;

  function reveal(element) {
    transition?.cancel();
    if (reducedMotion.matches || !element.animate) return;
    transition = element.animate(
      [{opacity: .52, transform: 'translateY(3px)'}, {opacity: 1, transform: 'translateY(0)'}],
      {duration: 180, easing: 'cubic-bezier(.2,.7,.3,1)'}
    );
  }

  function renderApproval() {
    const confirmed = approved.has(selected);
    result.dataset.approved = String(confirmed);
    fields.document.textContent = confirmed ? 'Booking confirmation' : 'Booking request';
    fields.status.textContent = confirmed ? 'Approved' : 'Awaiting approval';
    fields.payment.textContent = confirmed ? 'Paid in demo' : 'Card on file';
    fields.action.textContent = confirmed ? 'Reset request' : 'Approve request';
  }

  async function revealPhoto(scene) {
    const next = photos.find(photo => photo.dataset.scene === scene);
    if (!next || next.classList.contains('is-current')) return;
    try {
      // Keep the previous photo visible until the next one is ready to paint.
      await next.decode();
    } catch {
      if (!next.complete || !next.naturalWidth) return;
    }
    if (scene !== selected) return;
    for (const photo of photos) photo.classList.toggle('is-current', photo === next);
  }

  function renderBooking() {
    preview.dataset.scene = selected;
    revealPhoto(selected);
    for (const [field, value] of Object.entries(examples[selected])) {
      fields[field].textContent = value;
    }
    preview.querySelector('.desk-calendar-time').textContent = examples[selected].time;
    renderApproval();
  }

  function announceBooking() {
    const {brand, title} = examples[selected];
    fields.announcement.textContent = `${brand}. ${title}. ${fields.status.textContent}. ${fields.payment.textContent}.`;
  }

  choices.addEventListener('change', event => {
    selected = event.target.value;
    renderBooking();
    announceBooking();
    reveal(body);
  });

  approve.addEventListener('click', () => {
    if (approved.has(selected)) approved.delete(selected);
    else approved.add(selected);
    renderApproval();
    announceBooking();
    reveal(fields.status);
  });

  reducedMotion.addEventListener('change', () => transition?.cancel());
  renderBooking();
})();
