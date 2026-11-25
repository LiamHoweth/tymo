const companyForm = document.querySelector('#company-form');
const contactKey = 'tymo-demo-contact';
const contactFields = ['name', 'business', 'email'];

function restoreDemoContact(form) {
  if (location.hash !== '#from-demo') return;
  try {
    const contact = JSON.parse(sessionStorage.getItem(contactKey));
    for (const name of contactFields) {
      if (typeof contact?.[name] === 'string') form.elements.namedItem(name).value = contact[name];
    }
  } catch {
    // The intake also works when browser storage is unavailable.
  }
}

function submitForm(form, success) {
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('[data-form-status]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    const data = new FormData(form);
    button.disabled = true;
    status.hidden = false;
    status.textContent = 'Sending your request…';
    try {
      const response = await fetch(form.action, {
        method: 'POST', body: data, headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Submission was not confirmed');
    } catch {
      status.textContent = 'We couldn’t confirm delivery. Your answers are still here. Please try again.';
      button.disabled = false;
      return;
    }

    try {
      sessionStorage.removeItem(contactKey);
    } catch {
      // Contact carry-over is optional. The submission already succeeded.
    }
    form.reset();
    form.hidden = true;
    success.hidden = false;
    success.focus();
  });
}

if (companyForm) {
  restoreDemoContact(companyForm);
  submitForm(companyForm, document.querySelector('#company-success'));
}
