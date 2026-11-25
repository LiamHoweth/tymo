/**
 * Server-rendered HTML for the website requests admin page. No scripts.
 * Every interpolated value goes through the `html` tag, which escapes it
 * unless it is already rendered markup.
 */

class Markup {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

const escapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => escapes[character]);
}

/** Markup written in this file, never visitor input. */
const raw = (value) => new Markup(value);

function interpolate(value) {
  if (value instanceof Markup) return value.value;
  if (Array.isArray(value)) return value.map(interpolate).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(value);
}

function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, index) => {
    out += interpolate(value) + strings[index + 1];
  });
  return new Markup(out);
}

const central = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function centralParts(date) {
  return Object.fromEntries(central.formatToParts(date).map(({ type, value }) => [type, value]));
}

/**
 * "Tue, Nov 24 · 8:05 PM CT" in US Central time (CST and CDT both read CT).
 * The year is added when asked for or when it isn't the current year.
 */
export function formatReceived(value, { withYear = false, now = new Date() } = {}) {
  const date = value instanceof Date ? value : new Date(value ?? Number.NaN);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const parts = centralParts(date);
  const year = withYear || parts.year !== centralParts(now).year ? `, ${parts.year}` : "";
  return `${parts.weekday}, ${parts.month} ${parts.day}${year} · ${parts.hour}:${parts.minute} ${parts.dayPeriod} CT`;
}

/** The first ~120 characters of the notes on one line, or null when there are none. */
export function notesPreview(message, limit = 120) {
  const text = String(message ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const characters = Array.from(text);
  return characters.length > limit ? `${characters.slice(0, limit).join("").trimEnd()}…` : text;
}

const telHref = (phone) => `tel:${String(phone).split(/[x#]/i, 1)[0].replace(/[^\d+]/g, "")}`;
const requestHref = (row) => `/admin/requests/${encodeURIComponent(String(row.id).toLowerCase())}`;

/** Date and time stay on their own lines when a narrow column wraps. */
function receivedText(value, options) {
  const [date, time] = formatReceived(value, options).split(" · ");
  return time ? html`<span class="nowrap">${date}</span> · <span class="nowrap">${time}</span>` : date;
}

const styles = `
:root{--ink:#000924;--ink-2:#0b1530;--paper:#f3f5f9;--card:#fff;--line:#dfe4ec;--text:#0b1222;--muted:#586274;--accent:#d00b2b;--danger:#b4232f;color-scheme:light}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--paper);color:var(--text);font:400 14px/20px "DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
h1,h2,p,dl,dd,ul,form{margin:0}
ul{padding:0;list-style:none}
a{color:inherit}
button,input{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}
code{font-weight:600}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.nowrap{white-space:nowrap}
.muted{color:var(--muted)}
.skip{position:absolute;left:16px;top:6px;z-index:10;display:inline-flex;align-items:center;min-height:44px;padding:0 16px;background:var(--card);border:1px solid var(--line);font-weight:600;transform:translateY(-200%)}
.skip:focus{transform:none}
.bar{background:var(--ink);color:#fff}
.bar-inner{display:flex;flex-wrap:wrap;align-items:stretch;max-width:1200px;margin:0 auto;padding:0 16px}
.brand{display:flex;flex-shrink:0;align-items:center;gap:12px;height:56px;text-decoration:none}
.wordmark{font-weight:800;font-size:17px;letter-spacing:.16em;text-transform:uppercase}
.brand-rule{width:1px;height:20px;background:rgba(255,255,255,.25)}
.brand-label{font-size:15px;font-weight:600}
.nav{order:3;flex:0 0 calc(100% + 32px);margin:0 -16px;border-top:1px solid rgba(255,255,255,.15)}
.nav ul{display:flex;height:100%}
.nav li{display:flex;flex:1}
.nav a{display:flex;flex:1;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-bottom:2px solid transparent;color:rgba(255,255,255,.7);font-weight:500;text-decoration:none}
.nav a:hover{color:#fff}
.nav a[aria-current]{border-bottom-color:var(--accent);color:#fff}
.account{display:flex;align-items:center;gap:12px;min-width:0;margin-left:auto;padding-left:12px}
.account-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:rgba(255,255,255,.75)}
.account form{flex-shrink:0}
.signout{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid rgba(255,255,255,.3);border-radius:0;background:transparent;color:#fff;font-size:13px;font-weight:600;cursor:pointer}
.signout:hover{border-color:#fff;background:rgba(255,255,255,.1)}
main{flex:1}
.frame{width:100%;max-width:1200px;margin:0 auto;padding:24px 16px}
.page-head{margin-bottom:24px}
h1{font-size:22px;line-height:28px;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere}
.lede{margin-top:4px;color:var(--muted)}
.count{margin-bottom:12px;font-size:13px;color:var(--muted)}
.back{display:inline-flex;align-items:center;gap:6px;min-height:44px;margin:0 0 8px -4px;padding:0 4px;color:var(--muted);font-weight:500;text-decoration:none}
.back:hover{color:var(--text)}
.note{margin-bottom:16px;padding:12px 16px;border:1px solid var(--line);border-left:2px solid var(--muted);background:var(--card)}
.note-error{border-left-color:var(--danger)}
.empty{padding:40px 16px;border:1px solid var(--line);background:var(--card);text-align:center}
.empty-title{font-size:15px;line-height:20px;font-weight:600;letter-spacing:0}
.empty-body{max-width:28rem;margin:4px auto 0;color:var(--muted)}
.empty-action{display:flex;justify-content:center;margin-top:16px}
.button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border:1px solid var(--line);border-radius:0;background:var(--card);color:var(--text);font-weight:600;text-decoration:none;cursor:pointer}
.button:hover{border-color:var(--text)}
.button-primary{border-color:var(--ink);background:var(--ink);color:#fff}
.button-primary:hover{border-color:var(--ink-2);background:var(--ink-2)}
.button-block{width:100%}
.tap{display:inline-flex;align-items:flex-start;min-height:44px;padding:12px 0}
.link{text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:4px}
.link:hover{text-decoration-color:var(--text)}
.row-link{font-weight:600;text-decoration:none}
.row-link:hover{text-decoration:underline;text-underline-offset:4px}
.strong{display:block;font-weight:500}
.sub{display:block;font-size:13px;color:var(--muted)}
.contact{display:flex;flex-direction:column;align-items:flex-start;min-width:0}
.contact .tap{display:flex;max-width:100%;overflow-wrap:anywhere}
.contact .muted{display:block}
.cards{display:flex;flex-direction:column;gap:8px}
.card{position:relative;padding:0 16px 12px;border:1px solid var(--line);background:var(--card)}
.card:has(.row-link:focus-visible){border-color:var(--accent)}
.card .row-link{display:flex;min-height:44px;align-items:center;font-size:15px;overflow-wrap:anywhere}
.card .row-link::after{content:"";position:absolute;inset:0}
.card .contact a{position:relative;z-index:1}
.lines{display:grid;grid-template-columns:6.5rem minmax(0,1fr);column-gap:12px}
.lines dt,.lines dd{padding:6px 0}
.lines dt{color:var(--muted)}
.lines dd{min-width:0;overflow-wrap:anywhere}
.lines .tap-label{padding-top:12px}
.lines .contact{padding:0}
.table-wrap{display:none;overflow-x:auto;border:1px solid var(--line);background:var(--card)}
table{width:100%;border-collapse:collapse;text-align:left}
th{padding:10px 12px;border-bottom:1px solid var(--line);font-size:12px;line-height:16px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
td{padding:0 12px;border-bottom:1px solid var(--line);vertical-align:top}
th:first-child,td:first-child{padding-left:16px}
th:last-child,td:last-child{padding-right:16px}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover,tbody tr:has(a:focus-visible){background:var(--paper)}
.cell{padding:12px 0}
.col-received{min-width:8.5rem}
.col-name{min-width:7rem}
.col-business{min-width:8rem}
.col-contact{min-width:11rem;max-width:18rem}
.col-notes{min-width:9rem;max-width:22rem}
.col-name .row-link{overflow-wrap:break-word}
.panel{border:1px solid var(--line);background:var(--card)}
.panel-head{padding:12px 16px;border-bottom:1px solid var(--line)}
.panel-head h2{font-size:15px;line-height:20px;font-weight:600}
.details > div{display:grid;grid-template-columns:minmax(7rem,38%) minmax(0,1fr);gap:12px;padding:0 16px;border-top:1px solid var(--line)}
.details > div:first-child{border-top:0}
.details dt,.details dd{padding:12px 0}
.details dt{color:var(--muted)}
.details dd{min-width:0;overflow-wrap:anywhere}
.details .has-tap{padding:0}
.details .has-tap .tap{max-width:100%}
.details .notes{white-space:pre-wrap}
.login{display:flex;flex:1;justify-content:center;padding:40px 16px}
.login-panel{align-self:flex-start;width:100%;max-width:24rem;border:1px solid var(--line);background:var(--card)}
.login-head{padding:16px 20px;border-bottom:1px solid var(--line)}
.login-body{padding:20px}
.form{display:flex;flex-direction:column;gap:16px}
label{display:block;margin-bottom:4px;font-weight:500}
.input{display:block;width:100%;height:44px;padding:0 12px;border:1px solid var(--line);border-radius:0;background:var(--card);font-size:16px}
.input:hover{border-color:var(--muted)}
.input[aria-invalid="true"]{border-color:var(--danger)}
.form-error{padding-left:12px;border-left:2px solid var(--danger);color:var(--danger);font-weight:500}
@media (min-width:768px){
.bar-inner{flex-wrap:nowrap;height:56px;padding:0 24px}
.brand{height:auto}
.nav{order:0;flex:none;margin:0 0 0 32px;border-top:0}
.nav li{flex:none}
.frame{padding:32px 24px}
h1{font-size:24px;line-height:30px}
.cards{display:none}
.table-wrap{display:block}
.login{padding:80px 24px}
}
`;

const backIcon = raw(
  '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>',
);

/** current: "page" on the list, "true" on pages inside it. */
function topBar(user, current) {
  const account = user
    ? html`<nav class="nav" aria-label="Admin"><ul><li><a href="/admin"${raw(current ? ` aria-current="${current}"` : "")}>Website requests</a></li></ul></nav>
<div class="account"><span class="account-name"><span class="sr-only">Signed in as </span>${user}</span><form method="post" action="/admin/logout"><button type="submit" class="signout">Sign out</button></form></div>`
    : "";
  return html`<header class="bar"><div class="bar-inner">
<a class="brand" href="/admin"><span class="wordmark">Tymo</span><span class="brand-rule" aria-hidden="true"></span><span class="brand-label">Admin</span></a>
${account}
</div></header>`;
}

function page({ title, user = null, current = "true", body }) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} · Tymo admin</title>
<link rel="stylesheet" href="/fonts.css">
<style>${raw(styles)}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${topBar(user, current)}
<main id="main">
${body}
</main>
</body>
</html>
`.toString();
}

function emptyBlock({ title, body, heading = false, action = null }) {
  const titleMarkup = heading ? html`<h1 class="empty-title">${title}</h1>` : html`<p class="empty-title">${title}</p>`;
  return html`<div class="empty">${titleMarkup}<p class="empty-body">${body}</p>${
    action ? html`<div class="empty-action"><a class="button" href="${action.href}">${action.label}</a></div>` : ""
  }</div>`;
}

const notConnected = html`<div class="note" role="status">The request database isn't connected. Set <code>TYMO_LEADS_DATABASE_URL</code>.</div>`;

export function renderLoginPage({ enabled, user = "", error = null, invalid = false }) {
  const described = error ? ' aria-describedby="admin-signin-error"' : "";
  const invalidAttribute = invalid ? ' aria-invalid="true"' : "";
  const content = enabled
    ? html`<form class="form" method="post" action="/admin/login">
<div><label for="admin-user">Username</label><input class="input" id="admin-user" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${user}"${raw(invalidAttribute + described)}></div>
<div><label for="admin-password">Password</label><input class="input" id="admin-password" name="password" type="password" autocomplete="current-password" required${raw(invalidAttribute + described + (invalid ? " autofocus" : ""))}></div>
<p id="admin-signin-error" class="${error ? "form-error" : "sr-only"}" aria-live="polite">${error}</p>
<button type="submit" class="button button-primary button-block">Sign in</button>
</form>`
    : html`<div class="note" role="status">Admin sign-in is off on this server. Set <code>TYMO_ADMIN_USER</code>, <code>TYMO_ADMIN_PASSWORD</code> and <code>SESSION_SECRET</code> on the Tymo website service.</div>`;

  return page({
    title: "Sign in",
    body: html`<div class="login"><section class="login-panel" aria-labelledby="login-title">
<div class="login-head"><h1 id="login-title">Sign in</h1><p class="lede">For the Tymo team. A read-only view of requests sent from the website.</p></div>
<div class="login-body">${content}</div>
</section></div>`,
  });
}

function contactLines(row) {
  return html`<a class="tap link" href="mailto:${row.email}">${row.email}</a>${
    row.phone ? html`<a class="tap link" href="${telHref(row.phone)}">${row.phone}</a>` : html`<span class="muted">No phone</span>`
  }`;
}

function notesText(row) {
  const preview = notesPreview(row.message);
  return preview ?? html`<span class="muted">No notes</span>`;
}

function requestCards(rows, now) {
  return html`<ul class="cards">${rows.map((row) => html`
<li class="card"><a class="row-link" href="${requestHref(row)}">${row.name}</a>
<dl class="lines">
<dt>Received</dt><dd>${receivedText(row.created_at, { now })}</dd>
<dt>Business</dt><dd><span class="strong">${row.business}</span><span class="sub">${row.business_type}</span></dd>
<dt class="tap-label">Contact</dt><dd class="contact">${contactLines(row)}</dd>
<dt>Notes</dt><dd>${notesText(row)}</dd>
</dl></li>`)}
</ul>`;
}

function requestTable(rows, now) {
  return html`<div class="table-wrap"><table>
<thead><tr><th scope="col">Received</th><th scope="col">Name</th><th scope="col">Business</th><th scope="col">Contact</th><th scope="col">Notes</th></tr></thead>
<tbody>${rows.map((row) => html`
<tr>
<td class="col-received"><div class="cell">${receivedText(row.created_at, { now })}</div></td>
<td class="col-name"><a class="row-link tap" href="${requestHref(row)}">${row.name}</a></td>
<td class="col-business"><div class="cell"><span class="strong">${row.business}</span><span class="sub">${row.business_type}</span></div></td>
<td class="col-contact"><div class="contact">${contactLines(row)}</div></td>
<td class="col-notes"><div class="cell">${notesText(row)}</div></td>
</tr>`)}
</tbody>
</table></div>`;
}

/** problem: "unconnected" when there is no database, "error" when it couldn't be read. */
export function renderListPage({ user, rows = [], truncated = false, problem = null, now = new Date() }) {
  let content;
  if (problem === "unconnected") {
    content = notConnected;
  } else if (problem === "error") {
    content = html`<div class="note note-error" role="alert">Couldn't load requests right now. Reload to try again.</div>`;
  } else if (rows.length === 0) {
    content = emptyBlock({
      title: "No requests yet",
      body: "Requests sent from the Tymo website's quote form show up here.",
    });
  } else {
    const count = truncated
      ? html`<div class="note" role="status">Showing the newest ${rows.length}.</div>`
      : html`<p class="count">${rows.length} ${rows.length === 1 ? "request" : "requests"}</p>`;
    content = html`${count}${requestCards(rows, now)}${requestTable(rows, now)}`;
  }

  return page({
    title: "Website requests",
    user,
    current: "page",
    body: html`<div class="frame">
<header class="page-head"><h1>Website requests</h1><p class="lede">Sent from the quote form on the Tymo website. Times are Central (CT).</p></header>
${content}
</div>`,
  });
}

const backLink = html`<a class="back" href="/admin">${backIcon}All requests</a>`;

/** problem: "unconnected" or "error" instead of a row. */
export function renderDetailPage({ user, row = null, problem = null }) {
  if (!row) {
    const message = problem === "unconnected"
      ? notConnected
      : html`<div class="note note-error" role="alert">Couldn't load this request right now. Reload to try again.</div>`;
    return page({
      title: "Request",
      user,
      body: html`<div class="frame"><header class="page-head">${backLink}<h1>Request</h1></header>${message}</div>`,
    });
  }

  const item = (label, value, className = "") =>
    html`<div><dt>${label}</dt><dd${raw(className ? ` class="${className}"` : "")}>${value}</dd></div>`;
  return page({
    title: "Request",
    user,
    body: html`<div class="frame">
<header class="page-head">${backLink}<h1>${row.business}</h1></header>
<section class="panel" aria-labelledby="details-title">
<div class="panel-head"><h2 id="details-title">Request details</h2></div>
<dl class="details">
${item("Name", row.name)}
${item("Business", row.business)}
${item("Business type", row.business_type)}
${item("Email", html`<a class="tap link" href="mailto:${row.email}">${row.email}</a>`, "has-tap")}
${row.phone
    ? item("Phone", html`<a class="tap link" href="${telHref(row.phone)}">${row.phone}</a>`, "has-tap")
    : item("Phone", "No phone", "muted")}
${item("Received", formatReceived(row.created_at, { withYear: true }))}
${item("Request ID", html`<span class="mono">${row.id}</span>`)}
${row.message ? item("Notes", row.message, "notes") : item("Notes", "No notes", "muted")}
</dl>
</section>
</div>`,
  });
}

/** kind: "request" for an unknown request ID, otherwise any other missing admin page. */
export function renderNotFoundPage({ user, kind = "page" }) {
  const request = kind === "request";
  return page({
    title: request ? "Request not found" : "Page not found",
    user,
    body: html`<div class="frame">${emptyBlock({
      heading: true,
      title: request ? "Request not found" : "Page not found",
      body: request
        ? "No request has that ID. Check the link, or find the request in Website requests."
        : "There's no admin page at this address.",
      action: { href: "/admin", label: "All requests" },
    })}</div>`,
  });
}

/** A short full-page message (wrong method, refused form, unexpected error). */
export function renderMessagePage({ user = null, title, message }) {
  return page({
    title,
    user,
    body: html`<div class="frame">${emptyBlock({ heading: true, title, body: message, action: { href: "/admin", label: "Website requests" } })}</div>`,
  });
}
