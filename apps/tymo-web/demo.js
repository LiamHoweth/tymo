const quoteForm = document.querySelector('#quote-form');
const quoteButton = quoteForm.querySelector('button[type="submit"]');
const quoteRequestId = quoteForm.elements.namedItem('_request_id');
const quoteStatus = document.querySelector('#quote-status');
const quoteFailure = 'We couldn’t confirm your request. Please try again.';

function showQuoteStatus(state, message) {
  quoteStatus.dataset.state = state;
  quoteStatus.hidden = false;
  quoteStatus.textContent = message;
}

quoteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (quoteButton.disabled) return;

  quoteButton.disabled = true;
  showQuoteStatus('pending', 'Sending your quote request…');

  try {
    const response = await fetch(quoteForm.action, {
      method: 'POST',
      body: new URLSearchParams(new FormData(quoteForm)),
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout?.(15_000),
    });
    const result = await response.json();

    if (response.ok && result?.ok === true) {
      quoteForm.reset();
      quoteRequestId.defaultValue = globalThis.crypto?.randomUUID?.() ?? '';
      showQuoteStatus('sent', 'Thanks. We received your quote request and will follow up by email.');
    } else {
      const message = typeof result?.message === 'string' ? result.message : quoteFailure;
      showQuoteStatus('error', message);
    }
  } catch {
    showQuoteStatus('error', quoteFailure);
  } finally {
    quoteButton.disabled = false;
    quoteStatus.focus();
  }
});
