import { analyze, money, total, maxMessage } from './match.mjs'

const el = (selector) => document.querySelector(selector)
const header = el('#header')
const main = el('#main')
const footer = el('#footer')
const dialog = el('#dialog')
const safe = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const glyphs = {
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6 6-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  quote: '<path d="M4 12a6 6 0 0 1 6-6v6H4v6h6v-6m4 0a6 6 0 0 1 6-6v6h-6v6h6v-6"/>',
  receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6m-6 4h6m-6 4h3"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  box: '<path d="M3 7 12 3l9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v10"/>',
  shield: '<path d="M12 3 4 6v5c0 5 3.2 8 8 10 4.8-2 8-5 8-10V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
}
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name]}</svg>`
const brand = `<a class="brand" href="/" aria-label="Rekeep home"><img src="/mark.svg" width="33" height="33" alt="">Rekeep</a>`
const announce = (message) => { el('#status').textContent = message }
const params = new URLSearchParams(location.search)
let session
let cases = []
let filter = 'all'
let selectedId = params.get('case')
let selectedItem
let selectionCase
let editing = false

async function api(action, body, id) {
  const query = new URLSearchParams({ action })
  if (id) query.set('id', id)
  let response
  try {
    response = await fetch('/api/rekeep?' + query, body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  } catch { throw new Error('You’re offline or the workspace is unreachable. Try again when connected.') }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(data.error || 'The workspace could not finish this request.'), { status: response.status })
  return data
}

function nav(kind) {
  const current = location.pathname
  const active = (route) => current === route ? ' aria-current="page"' : ''
  const links = kind === 'workspace'
    ? `<div class="nav-tools"><a class="text-link" href="/workspace"${active('/workspace')}>Inbox</a><button type="button" class="avatar" aria-label="Account" data-action="account">${safe((session.shop || session.email)[0].toUpperCase())}</button></div>`
    : kind === 'auth' ? '<a class="text-link" href="/">Back to home</a>'
    : `<div class="nav-center"><a class="text-link" href="/intro"${active('/intro')}>How it works</a><a class="text-link" href="/#compare">Compare</a><a class="text-link" href="/#security">Security</a><a class="text-link" href="/signin">Sign in</a></div><div class="nav-tools"><a class="btn primary small" href="/signup">Get started</a></div>`
  header.className = 'header header-' + kind
  header.innerHTML = `<div class="shell header-inner">${brand}<nav aria-label="Main navigation" class="head-links nav-${kind}">${links}</nav></div>`
  footer.innerHTML = kind === 'workspace' || kind === 'auth' ? '' : `<div class="shell foot-inner"><div class="footer-main">
    <div><a href="/" class="footer-mark" aria-label="Rekeep home"><img src="/mark.svg" width="42" height="42" alt=""></a><p class="footer-heading">Refund the right item.<br><span>Keep the rest of the order.</span></p></div>
    <nav aria-label="Footer navigation"><strong>Rekeep</strong><a href="/intro">How it works</a><a href="/#compare">Compare</a><a href="/#security">Security</a></nav>
    </div><div class="footer-base"><span>© ${new Date().getFullYear()} Rekeep</span><div><a href="/signin">Sign in</a><a href="#top" aria-label="Back to top">↑</a></div></div><div class="footer-accent" aria-hidden="true"></div></div>`
}

const steps = [
  { title: 'Open a refund case', copy: 'Add the order number, purchased items, and the message that prompted the return.', icon: 'inbox' },
  { title: 'Review the affected item', copy: 'Read the evidence behind the match, then confirm the item and the amount.', icon: 'box' },
  { title: 'Keep the refund record', copy: 'Save the provider’s refund reference with the order so you can find it later.', icon: 'receipt' },
]

const workflow = [
  { tab: 'Refund inbox', title: 'See which orders need a decision', copy: 'Open cases and resolved refunds in the same workspace.', note: 'Each case keeps the order number and current status together.', lines: [['#O-2048', 'Needs review'], ['#O-2051', 'Resolved'], ['#O-2054', 'Open']], tone: 'blue' },
  { tab: 'New case', title: 'Start with the order and message', copy: 'Enter the items paid for and the original customer message.', note: 'Capture the customer’s wording before you select the item.', lines: [['Order number', '#O-2048'], ['Customer message', 'The blue mug arrived chipped.'], ['Order items', '3 lines']], tone: 'mint' },
  { tab: 'Item review', title: 'Review the suggested line', copy: 'Check the wording and amount before selecting what to refund.', note: 'Reread the customer’s message and review the suggested line before confirming.', lines: [['Blue ceramic mug', '$18.00'], ['Grid notebook', '$12.00'], ['Gel pen', '$8.00']], tone: 'amber' },
  { tab: 'Record refund', title: 'Save the provider reference', copy: 'Record the amount and reference together so the case is traceable.', note: 'Keep the payment provider’s reference with the exact order item.', lines: [['Refund amount', '$18.00'], ['Stays on the order', '$20.00'], ['Sample reference', 'O-2048']], tone: 'amber' },
  { tab: 'Resolved case', title: 'Find the decision later', copy: 'Keep the customer message, order lines, and refund record together.', note: 'Open the original case whenever you need to check what was refunded.', lines: [['Refund', '$18.00'], ['Retained amount', '$20.00'], ['Case status', 'Resolved']], tone: 'mint' },
]

function workflowPreview() {
  return `<section class="shell workflow-preview" aria-labelledby="workflow-title">
    <h2 id="workflow-title">One record for every return.</h2>
    <div class="preview-tabs" role="tablist" aria-label="Refund workflow">
      ${workflow.map(({tab}, i) => `<button type="button" role="tab" id="preview-tab-${i}" aria-controls="preview-panel-${i}" aria-selected="${i === 0}" tabindex="${i ? -1 : 0}" data-preview="${i}">${tab}</button>`).join('')}
    </div>
    ${workflow.map(({tab,title,copy,note,lines,tone}, i) => `<article class="preview-frame preview-panel" role="tabpanel" id="preview-panel-${i}" aria-labelledby="preview-tab-${i}" tabindex="0" ${i ? 'hidden' : ''}>
      <div class="preview-caption"><div><h3>${title}</h3><p>${copy}</p></div><p>${note}</p></div>
      <div class="preview-photo preview-${tone}"><div class="sample-window"><div class="sample-bar"><img src="/mark.svg" width="22" height="22" alt="">${tab}</div><dl>
      ${lines.map(([label, value], n) => `<div class="sample-line sample-line-${n}"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
      <div class="sample-foot">Sample order <strong>#O-2048</strong></div></div></div>
    </article>`).join('')}
  </section>`
}

function heroLoop() {
  return `<div class="media-device">
    <video autoplay muted loop playsinline disablepictureinpicture disableremoteplayback aria-hidden="true" poster="/hero-loop.webp">${matchMedia('(prefers-reduced-motion: reduce)').matches ? '' : '<source src="/workflow-tour.mp4" type="video/mp4">'}</video>
  </div>`
}

const capabilities = [
  { label: 'Item review', before: 'A message says the blue mug arrived chipped. You have to find which line it refers to.', after: 'The message sits beside the original order. Review the suggested mug and its $18 price before you confirm.' },
  { label: 'Case history', before: 'An update arrives after the refund. The decision is somewhere in an old thread.', after: 'Filter for resolved cases and reopen the original order with the decision and refund amount together.' },
  { label: 'Refund record', before: 'The payment provider issues a reference. You still need to connect it to the item.', after: 'Save the reference with the affected line and see the $18 refund alongside the $20 that stayed on the order.' },
]

const comparisons = [
  ['Customer context', 'Message next to the order', 'Message thread', 'Copied notes', 'Search the inbox'],
  ['Item selection', 'Suggested line with evidence', 'Item described in words', 'Line entered by hand', 'Check the order manually'],
  ['Refund amount', 'Item and remaining amount together', 'Check the original order', 'Maintain a formula', 'Calculate per request'],
  ['Review decision', 'Confirm the affected line in the case', 'Reply in the thread', 'Update a status field', 'Rely on handoff notes'],
  ['Provider reference', 'Reference saved with the case', 'Search a follow-up message', 'Add a separate column', 'Look it up at the provider'],
  ['Case history', 'Open and resolved cases together', 'Filter or search messages', 'Maintain a separate log', 'Reconstruct the history'],
]

function stepFigure(symbol) {
  return `<svg class="step-figure" viewBox="0 0 252 124" aria-hidden="true">
    <path class="step-guide" d="M17 83 126 18l109 65-109 38Z" fill="none" stroke="#e2ded9" stroke-dasharray="3 5"/>
    <path d="M67 76 126 42l59 34-59 34Z" fill="#eee8e1" stroke="#ded6ce"/>
    <g class="step-chip"><path d="M73 59 126 29l53 30v13l-53 30-53-30Z" fill="#f1e6df" stroke="#ceaa9b"/>
    <path d="M73 59 126 29l53 30-53 30Z" fill="#fff8f1" stroke="#f17145" stroke-width="2"/>
    <path d="M88 59 126 37l38 22-38 22Z" fill="#242424"/>
    <svg x="115" y="49" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${glyphs[symbol]}</svg></g>
  </svg>`
}

const faq = [
  ['Does Rekeep refund the entire order?', 'Each case records the refund for the line you select. You can review the original total, the refund, and the amount kept before continuing.'],
  ['What if two items match the message?', 'Rekeep asks for manual review when the description is ambiguous. You can select the correct line yourself.'],
  ['Where do I enter the payment reference?', 'Use Record refund after issuing a refund with your provider. The reference is saved with that order and item.'],
  ['Who can see our refund cases?', 'You need to sign in to your workspace to see your store’s cases. The public website uses a sample order in its workflow video.'],
]

function home() {
  nav('public')
  main.innerHTML = `<section class="landing-hero">
    <div class="hero-split"><h1>Give product<br>returns one clear<br>next step<span class="accent">.</span></h1>
    <div class="hero-person" aria-hidden="true"><img class="merchant-body" src="/merchant-hero.webp" width="604" height="900" alt="" fetchpriority="high"><img class="merchant-head" src="/merchant-hero.webp" width="604" height="900" alt=""></div>
    <div class="hero-side"><p><strong>One damaged item can put a whole order in doubt.<br><span class="accent">See exactly what to refund.</span></strong></p>
    <p>Match a customer’s message to a purchased item. Review the amount and keep the refund reference with the order.</p></div></div>
    <div class="hero-media">
      <div class="hero-landscape hero-landscape-left" aria-hidden="true"></div>
      <div class="hero-landscape hero-landscape-right" aria-hidden="true"></div>
      <div class="hero-ring" aria-hidden="true"></div>
      <div class="hero-actions"><a href="/signup" class="btn primary action-raised">Start a refund case ${icon('arrow',17)}</a></div>
      ${heroLoop()}
    </div>
  </section>
  <section class="shell hero meet-section"><div class="hero-copy"><p class="hero-kicker">Meet Rekeep</p>
    <h2>Item-level returns and refunds,<br><span>in one workspace<span class="accent">.</span></span></h2>
    <div class="hero-note"><p>Bring the customer’s message and order into the same case. See which line matches and how much stays on the order.</p>
    <p><strong>You review the item. Rekeep keeps the record.</strong></p></div>
  </div></section>
  ${workflowPreview()}
  <div class="landscape-break" aria-hidden="true"></div>
  <section class="shell practice-section" aria-labelledby="practice-title">
    <div class="practice-copy"><h2 id="practice-title">Handle the refund without losing the order.</h2><p>Keep the evidence, decision, and provider reference with the original order.</p><a href="/signup" class="btn primary action-raised">Start a refund case ${icon('arrow',17)}</a></div>
    <div class="practice-cards">
      <article class="practice-card"><h3>Item selection</h3><div><strong>Customer message</strong><p>“The mug arrived chipped. The notebook and pen are fine.”</p></div><div><strong>With Rekeep</strong><p>Review the $18 mug against the $38 order and confirm which line to refund.</p></div></article>
      <article class="practice-card"><h3>Refund history</h3><div><strong>After the refund</strong><p>The case still needs the item, amount and provider reference for follow-up.</p></div><div><strong>With Rekeep</strong><p>Save the $18 refund record and see the $20 that stayed on the order.</p></div></article>
    </div>
  </section>
  <section class="shell comparison-section" id="compare" aria-labelledby="comparison-title">
    <p class="section-chip">Rekeep workspace</p><h2 id="comparison-title">See where every part<br>of the refund lives.</h2>
    <p class="comparison-note">From the customer’s first message to the payment reference, each refund decision stays with the original order.</p>
    <div class="comparison-scroll" role="region" aria-label="Compare refund workflows" tabindex="0" data-reveal><table><thead><tr><th scope="col"><span class="sr">Workflow</span></th><th scope="col"><img src="/mark.svg" width="44" height="44" alt="Rekeep"></th><th scope="col">Email thread</th><th scope="col">Spreadsheet</th><th scope="col">Manual process</th></tr></thead>
    <tbody>${comparisons.map(([label,...values])=>`<tr><th scope="row">${label}</th>${values.map(value=>`<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  </section>
  <section class="shell capabilities" aria-labelledby="capability-title">
    <header class="capability-intro"><h2 id="capability-title">What you get in the workspace</h2><p>Review the item, find the decision, and keep the refund reference on the same order.</p><a href="/signup" class="btn primary action-raised">Start a refund case ${icon('arrow',17)}</a></header>
    <div class="capability-grid">${capabilities.map(({label,before,after})=>`<article class="capability" data-reveal><h3>${label}</h3><div><strong>Before</strong><p>${before}</p></div><div><strong>With Rekeep</strong><p>${after}</p></div></article>`).join('')}</div>
  </section>
  <section class="shell timeline"><h2>How a refund case moves</h2><ol>${steps.map(({title,copy,icon: symbol},i)=>`<li data-reveal><span>0${i+1}.</span><div><h3>${title}</h3><p>${copy}</p></div>${stepFigure(symbol)}</li>`).join('')}</ol></section>
  <section class="shell security-section" id="security"><div><span class="tile">${icon('shield',22)}</span><h2>Private cases. Reviewed refunds.</h2></div><p>Sign in to access your store’s cases. Review the item and amount before approving a refund.</p><a class="btn outline" href="/intro">See how it works ${icon('arrow',16)}</a></section>
  <section class="shell faq-section"><h2>FAQ</h2><div class="faq-list">${faq.map(([question,answer])=>`<details><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div></section>
  <section class="shell closing-cta"><h2>Ready for the next return?</h2><p>Open your workspace and keep each refund with its order.</p><div class="hero-actions"><a class="btn primary" href="/signup">Create an account</a><a class="btn outline" href="/signin">Sign in</a></div></section>`
  const motion = new IntersectionObserver((entries, observer) => {
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting) continue
      target.classList.add('motion-visible')
      observer.unobserve(target)
    }
  }, { threshold: .18 })
  main.querySelectorAll('[data-reveal],.preview-panel').forEach(target => motion.observe(target))
}

function intro() {
  nav('public')
  main.innerHTML = `<section class="shell hero intro-hero"><div class="hero-copy"><p class="hero-kicker">How it works</p>
    <h1>From complaint<br><span>to refund record<span class="accent">.</span></span></h1>
    <div class="hero-note"><p>Check the order, choose the affected item, and keep the refund reference with the case.</p></div>
  </div></section>
  <section class="shell workflow-list" aria-label="Refund steps">
    ${steps.map(({title,copy,icon: symbol}, i) => `<article><span class="step-index">0${i + 1}</span><div><h2>${title}</h2><p>${copy}</p></div><span class="tile">${icon(symbol,21)}</span></article>`).join('')}
    <a class="btn primary action-raised" href="/signup">Create an account ${icon('arrow',17)}</a>
  </section>`
}

function authView(signup) {
  nav('auth')
  const label = signup ? 'Create account' : 'Sign in'
  main.innerHTML = `<div class="shell auth-layout"><section class="auth-panel">
    <p class="overline"><span></span> Rekeep workspace</p><h1>${signup ? 'Create your account.' : 'Welcome back.'}</h1>
    <p class="subtle">${signup ? 'Set up your store’s refund workspace.' : 'Sign in to review cases and refund records.'}</p>
    <form id="auth-form" data-action="${signup ? 'signup' : 'signin'}" class="stack">
      ${signup ? '<label>Store name<input name="shop" autocomplete="organization" maxlength="60" required placeholder="e.g. Sunday Supply"></label>' : ''}
      <label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@store.com"></label>
      <label>Password<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" ${signup ? 'minlength="10"' : ''} maxlength="128" required placeholder="${signup ? 'At least 10 characters' : 'Enter your password'}"></label>
      <p class="feedback" role="alert" hidden></p><button class="btn primary full" type="submit">${label} ${icon('arrow',18)}</button>
    </form>
    <p class="switch">${signup ? 'Already have an account? <a href="/signin">Sign in</a>' : 'New to Rekeep? <a href="/signup">Create an account</a>'}</p></section>
    <aside class="auth-art"><picture><source media="(prefers-reduced-motion: reduce)" srcset="/auth-motion-still.webp"><img src="/auth-motion.gif" width="680" height="560" alt=""></picture><div><h2>A clear record for every refund.</h2><p>Find the complaint, order line, and receipt together.</p></div></aside></div>`
}
function confirmation(message, link) {
  nav('auth')
  main.innerHTML = `<div class="shell simple"><section class="panel"><span class="tile">${icon('shield')}</span><h1>${safe(message)}</h1><p>${safe(link)}</p><a class="btn primary" href="/signin">Back to sign in</a></section></div>`
}
function confirmLink() {
  const link = new URLSearchParams(location.hash.slice(1))
  history.replaceState(null, '', '/confirm')
  if (link.has('error')) return confirmation('Couldn’t confirm your email.', 'This link may have expired. Open the most recent email from Rekeep.')
  if (link.get('type') === 'signup' && link.has('access_token')) return confirmation('Your email is confirmed.', 'Sign in with the account you just created.')
  confirmation('Check your confirmation link.', 'Open the confirmation link from your email. If you already confirmed it, sign in.')
}

const closeBtn = '<button type="button" class="btn outline" data-action="close">Cancel</button>'
function show(title, content) {
  dialog.innerHTML = `<div class="dialog-title"><h2 id="dialog-title">${title}</h2><button type="button" class="plain" data-action="close" aria-label="Close">${icon('close')}</button></div>${content}`
  dialog.showModal()
}
function feedback(form, message) {
  const target = form.querySelector('.feedback')
  target.textContent = message
  target.hidden = !message
}
function savedRefund(entry) { return Array.isArray(entry.refund) ? entry.refund[0] : entry.refund }
function caseFor() { return cases.find(({ id }) => id === selectedId) }
function statusOf(entry) { return savedRefund(entry)?.status === 'pending' ? 'Pending verification' : savedRefund(entry) ? 'Resolved' : 'Open' }
function dateOf(value) { return new Intl.DateTimeFormat('en', { month:'short', day:'numeric' }).format(new Date(value)) }
function itemName(item) { return `${safe(item.name)}${item.detail !== 'Order item' ? ` <small>${safe(item.detail)}</small>` : ''}` }

function caseDetail(entry) {
  const refund = savedRefund(entry)
  const review = analyze(entry.message, entry)
  if (selectionCase !== entry.id) {
    selectionCase = entry.id
    selectedItem = review.itemId
  }
  const item = entry.items.find((line) => line.id === (refund?.item_id ?? selectedItem))
  const found = entry.items.find((line) => line.id === review.itemId)
  const amount = refund?.amount_cents ?? item?.cents
  return `<div class="case-detail">
    <a class="text-link back-mobile" href="/workspace">${icon('back',18)} Refund inbox</a>
    <div class="case-title"><div><p class="overline">Order #${safe(entry.order_number)}</p><h1>${safe(entry.customer)}</h1><p class="subtle">Opened ${dateOf(entry.created_at)}</p></div><span class="status-pill ${refund?.status === 'pending' ? 'pending' : refund ? 'closed' : ''}">${statusOf(entry)}</span></div>
    <div class="detail-grid"><div class="detail-column"><section class="panel">
    <div class="panel-title"><h2>Customer message</h2>${!refund && !editing ? '<button type="button" class="text-link" data-action="edit">Edit</button>' : ''}</div>
    ${editing ? `<form class="stack" data-action="message"><label class="sr" for="msg">Customer message</label><textarea name="message" id="msg" rows="4" required maxlength="${maxMessage}">${safe(entry.message)}</textarea><p class="feedback" role="alert" hidden></p><div class="actions"><button class="btn primary" type="submit">Save message</button><button class="btn outline" type="button" data-action="cancel-edit">Cancel</button></div></form>` : `<blockquote class="message">${safe(entry.message)}</blockquote>`}
    </section><section class="panel"><div class="panel-title"><h2>Order items</h2><span class="subtle">${entry.items.length} lines</span></div>
    <div class="order-list" aria-label="Order items">${entry.items.map((line) => `<button type="button" class="line" data-item="${safe(line.id)}" aria-pressed="${line.id === item?.id}" ${refund || editing ? 'disabled' : ''}><span class="line-icon">${icon('box',19)}</span><span class="line-name">${itemName(line)}</span><strong>${money(line.cents)}</strong><span class="radio">${line.id === item?.id ? icon('check',13) : ''}</span></button>`).join('')}</div></section></div>
    <div class="detail-column"><section class="panel evidence"><div class="panel-title"><h2>${found ? 'Suggested item' : 'Needs review'}</h2><span class="tile">${icon('quote',16)}</span></div>
    <p>${found ? `<strong>${safe(found.name)}</strong> · ${safe(review.reason)}` : safe(review.reason)}</p>
    ${review.quote ? `<blockquote>“${safe(review.quote)}”</blockquote>` : ''}
    </section><section class="panel bill"><div class="panel-title"><h2>${refund ? 'Refund record' : 'Refund breakdown'}</h2>${refund ? icon('receipt') : ''}</div>
    <dl><dt>Original payment</dt><dd>${money(total(entry))}</dd><dt>Amount kept</dt><dd>${amount ? money(total(entry) - amount) : '—'}</dd><dt>Refund amount</dt><dd>${amount ? money(amount) : '—'}</dd></dl>
    ${refund ? `<div class="receipt-meta"><p>${refund.source === 'external' ? 'Recorded from your payment provider' : refund.status === 'pending' ? 'Verify this refund order in Braintree' : 'PayPal Braintree Sandbox'}</p><div><span>Reference</span><strong>${safe(refund.reference)}</strong></div><div><span>Recorded</span><strong>${dateOf(refund.created_at)}</strong></div></div>` :
    `<button type="button" class="btn primary full" data-action="record" ${item && !editing ? '' : 'disabled'}>${item ? 'Record refund' : 'Select an order item'} ${icon('arrow',17)}</button>
    ${session.braintree ? `<button type="button" class="btn outline full pay-btn" data-action="braintree" ${item && !editing ? '' : 'disabled'}>Issue Sandbox refund</button>` : ''}
    <p class="subtle bill-note">Record a refund you’ve already issued with your payment provider.</p>`}</section></div></div></div>`
}

function workspace() {
  nav('workspace')
  const entry = caseFor()
  const shown = cases.filter((record) => filter === 'all' || (filter === 'closed' ? statusOf(record) === 'Resolved' : statusOf(record) !== 'Resolved'))
  main.innerHTML = `<div class="shell workspace ${entry ? 'has-case' : ''}"><aside class="queue">
    <div class="queue-head"><p class="overline">${safe(session.shop || 'Your store')}</p><h1>Refund inbox</h1><button type="button" class="btn primary full" data-action="new">${icon('plus',18)} New case</button></div>
    <nav class="tabs" aria-label="Filter refund cases">${[['all','All'],['open','Open'],['closed','Resolved']].map(([key,label]) => `<button type="button" aria-pressed="${filter === key}" data-filter="${key}">${label}</button>`).join('')}</nav>
    <div class="queue-items">${shown.length ? shown.map((record) => `<a class="case-link" href="/workspace?case=${encodeURIComponent(record.id)}" data-case="${safe(record.id)}" ${entry?.id === record.id ? 'aria-current="page"' : ''}><span class="queue-icon">${icon('receipt',19)}</span><span><strong>${safe(record.customer)}</strong><small>#${safe(record.order_number)} · ${statusOf(record)}</small></span><span class="case-link-date">${dateOf(record.created_at)}</span></a>`).join('') : '<p class="queue-empty">No cases in this view.</p>'}</div>
    </aside><section class="workspace-body" aria-label="Case workspace">${entry ? caseDetail(entry) : `<div class="empty-state"><span class="tile">${icon('inbox',24)}</span><h2>${cases.length ? 'Select a case' : 'Your inbox is ready.'}</h2><p>${cases.length ? 'Choose an order to review its message and refund status.' : 'Open a case with the order items and customer message.'}</p>${cases.length ? '' : '<button type="button" class="btn outline" data-action="new">Open first case</button>'}</div>`}</section></div>`
}
function openCase(id) {
  selectedId = id
  editing = false
  history.pushState(null, '', '/workspace' + (id ? '?case=' + encodeURIComponent(id) : ''))
  workspace()
  window.scrollTo(0,0)
  main.focus({ preventScroll:true })
}
async function loadWorkspace() {
  try {
    session = await api('session')
    ;({ cases } = await api('cases'))
    workspace()
  } catch (error) {
    if ([400,401,403].includes(error.status)) return location.replace('/signin')
    nav('auth')
    main.innerHTML = `<div class="shell simple"><section class="panel"><h1>Workspace unavailable.</h1><p>${safe(error.message)}</p><a class="btn primary" href="/workspace">Try again</a></section></div>`
  }
}
function orderRow(index) {
  return `<fieldset class="order-fields"><legend>Item ${index}</legend><label>Item name<input name="item-name" maxlength="80" required placeholder="Ceramic mug"></label><label>Variant<input name="variant" maxlength="50" placeholder="Oat · 12 oz"></label><label>Price (USD)<input name="price" inputmode="decimal" pattern="[0-9]{1,5}([.][0-9]{1,2})?" required placeholder="18.00"></label>${index > 2 ? '<button class="text-link remove-line" type="button" data-action="remove-line">Remove item</button>' : ''}</fieldset>`
}
function newCase() {
  show('New refund case', `<form class="stack" data-action="new">
    <div class="pair"><label>Order number<input name="order" maxlength="24" required placeholder="2048"></label><label>Customer name<input name="customer" maxlength="64" required placeholder="Maya Chen"></label></div>
    <label>Customer message<textarea name="message" maxlength="${maxMessage}" rows="3" required placeholder="Paste the customer’s message"></textarea></label>
    <div class="item-fields">${orderRow(1)}${orderRow(2)}</div>
    <button type="button" class="text-link add-line" data-action="add-line">${icon('plus',16)} Add item</button>
    <p class="subtle">Enter the actual amount paid for each line after any discounts.</p>
    <p class="feedback" role="alert" hidden></p><div class="dialog-actions">${closeBtn}<button type="submit" class="btn primary">Open case</button></div></form>`)
}
function refundDialog(action) {
  const entry = caseFor()
  const item = entry.items.find((line) => line.id === selectedItem)
  if (!item) return
  const gateway = action === 'braintree'
  show(gateway ? 'Issue Sandbox refund' : 'Record a refund', `<form class="stack" data-action="${action}">
    <div class="refund-confirm"><span>${itemName(item)}</span><strong>${money(item.cents)}</strong></div>
    <p class="subtle">${gateway ? 'This will send a partial test refund to Braintree Sandbox after verifying the original payment.' : 'Enter the reference from your payment provider for the refund already issued.'}</p>
    <label>${gateway ? 'Braintree transaction ID' : 'Refund reference'}<input name="reference" required maxlength="120"></label>
    <p class="feedback" role="alert" hidden></p><div class="dialog-actions">${closeBtn}<button type="submit" class="btn primary">${gateway ? 'Approve refund' : 'Save refund record'}</button></div></form>`)
}
function account() {
  show('Your account', `<div class="stack"><p><strong>${safe(session.shop)}</strong></p><p class="subtle">${safe(session.email)}</p><form class="stack" data-action="signout"><p class="feedback" role="alert" hidden></p><button class="btn outline full" type="submit">Sign out</button></form></div>`)
}
function reindex() {
  const rows = dialog.querySelectorAll('.order-fields')
  rows.forEach((row, index) => { row.querySelector('legend').textContent = 'Item ' + (index + 1) })
  const add = dialog.querySelector('.add-line')
  if (add) add.disabled = rows.length >= 10
}
function selectPreview(tab) {
  const tabs = Array.from(document.querySelectorAll('[data-preview]'))
  for (const candidate of tabs) {
    const active = candidate === tab
    candidate.tabIndex = active ? 0 : -1
    candidate.setAttribute('aria-selected', String(active))
    document.getElementById(candidate.getAttribute('aria-controls')).hidden = !active
  }
}

document.addEventListener('keydown', (event) => {
  const tab = event.target.closest('[data-preview]')
  if (!tab) return
  const tabs = Array.from(tab.parentElement.querySelectorAll('[data-preview]'))
  const index = tabs.indexOf(tab)
  const target = {
    ArrowLeft: tabs[(index + tabs.length - 1) % tabs.length],
    ArrowRight: tabs[(index + 1) % tabs.length],
    Home: tabs[0],
    End: tabs.at(-1),
  }[event.key]
  if (!target) return
  event.preventDefault()
  selectPreview(target)
  target.focus()
})

document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action],[data-filter],[data-case],[data-item],[data-preview],.back-mobile')
  if (!control || control.tagName === 'FORM' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  if (control.hasAttribute('data-preview')) return selectPreview(control)
  const action = control.dataset.action
  if (control.matches('.back-mobile') && session) { event.preventDefault(); return openCase(null) }
  if (control.dataset.case) { event.preventDefault(); return openCase(control.dataset.case) }
  if (control.dataset.filter) {
    filter = control.dataset.filter
    workspace()
    main.querySelector(`[data-filter="${filter}"]`)?.focus()
  }
  if (control.dataset.item) {
    selectedItem = control.dataset.item
    workspace()
    main.querySelector(`[data-item="${CSS.escape(selectedItem)}"]`)?.focus({ preventScroll:true })
    announce('Refund breakdown updated.')
  }
  if (action === 'new') newCase()
  if (action === 'close') dialog.close()
  if (action === 'account') account()
  if (action === 'edit') { editing = true; workspace(); el('#msg').focus() }
  if (action === 'cancel-edit') { editing = false; workspace(); main.querySelector('[data-action="edit"]')?.focus() }
  if (action === 'record' || action === 'braintree') refundDialog(action)
  if (action === 'add-line') {
    const fields = dialog.querySelector('.item-fields')
    if (fields.children.length < 10) fields.insertAdjacentHTML('beforeend', orderRow(fields.children.length + 1))
    reindex()
    fields.lastElementChild.querySelector('input').focus()
  }
  if (action === 'remove-line') { control.closest('fieldset').remove(); reindex(); dialog.querySelector('.add-line').focus() }
})
document.addEventListener('submit', async (event) => {
  const form = event.target
  const action = form.dataset.action
  if (!action) return
  event.preventDefault()
  const button = form.querySelector('[type="submit"]')
  if (button.disabled) return
  button.disabled = true
  feedback(form, '')
  const data = new FormData(form)
  const values = Object.fromEntries(data)
  try {
    if (action === 'signin' || action === 'signup') {
      const result = await api(action, values)
      if (result.signedIn) location.replace('/workspace')
      else confirmation('Check your inbox.', 'Open the email from Rekeep to confirm your address and sign in.')
      return
    }
    if (action === 'signout') {
      await api('signout', {})
      location.replace('/')
      return
    }
    if (action === 'new') {
      const variants = data.getAll('variant')
      const prices = data.getAll('price')
      const items = data.getAll('item-name').map((name, index) => ({ name, variant: variants[index], price: prices[index] }))
      const result = await api('new', { orderNumber: values.order, name: values.customer, message: values.message, items })
      cases.unshift(result.case)
      filter = 'all'
      dialog.close()
      openCase(result.case.id)
      announce('Refund case opened.')
      return
    }
    const result = await api(action, action === 'message' ? { message: values.message } : { item: selectedItem, reference: values.reference }, selectedId)
    if (result.case) cases = cases.map((record) => record.id === result.case.id ? result.case : record)
    if (action === 'message') { editing = false; selectionCase = undefined }
    if (dialog.open) dialog.close()
    workspace()
    main.focus({ preventScroll:true })
    announce(result.notice || (action === 'message' ? 'Customer message saved.' : 'Refund record saved.'))
  } catch (error) {
    feedback(form, error.message)
  } finally { button.disabled = false }
})
window.addEventListener('popstate', () => {
  if (!session || location.pathname !== '/workspace') return
  selectedId = new URLSearchParams(location.search).get('case')
  editing = false
  workspace()
})
const path = location.pathname.replace(/\/$/, '') || '/'
if (path === '/workspace') loadWorkspace()
else if (path === '/confirm') confirmLink()
else if (path === '/signin' || path === '/signup') authView(path === '/signup')
else if (path === '/intro') intro()
else home()
