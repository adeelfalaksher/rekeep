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
  install: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  play: '<path d="m9 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>',
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
let installEvent

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
  header.className = 'header'
  header.innerHTML = `<div class="shell header-inner">${brand}<nav aria-label="Main navigation" class="head-links">${kind === 'workspace'
    ? `<button type="button" class="plain install" data-action="install">${icon('install',18)} <span>Install</span></button><button type="button" class="avatar" aria-label="Account" data-action="account">${safe((session.shop || session.email)[0].toUpperCase())}</button>`
    : kind === 'auth' ? '<a class="text-link" href="/">Back to home</a>'
    : '<a class="text-link intro-link" href="/intro">How it works</a><a class="text-link" href="/signin">Sign in</a><a class="btn primary small" href="/signup">Get started</a>'}</nav></div>`
  footer.innerHTML = kind === 'workspace' || kind === 'auth' ? '' : `<div class="shell foot-inner">${brand}<span>Refunds, item by item.</span><a href="/intro">How it works</a></div>`
}

function graphic() {
  return `<div class="hero-art" aria-hidden="true">
    <div class="art-top"><span class="art-indicator"></span> ORDER #2048 <span class="art-total">$38.00</span></div>
    <div class="art-receipt">
      <div class="paper-title"><span>${icon('receipt',21)}</span><div><strong>Order details</strong><small>3 items</small></div></div>
      <div class="paper-line art-active"><span class="art-icon">${icon('box',18)}</span><div><strong>Ceramic mug</strong><small>Oat · 12 oz</small></div><b>$18.00</b></div>
      <div class="paper-line"><span class="art-icon">${icon('box',18)}</span><div><strong>Grid notebook</strong><small>Sage · A5</small></div><b>$12.00</b></div>
      <div class="paper-line"><span class="art-icon">${icon('box',18)}</span><div><strong>Gel pen</strong><small>Black · 0.5 mm</small></div><b>$8.00</b></div>
    </div>
    <div class="art-refund"><span>${icon('check',22)}</span><div><small>Refund amount</small><strong>$18.00</strong></div></div>
    <p class="art-caption">One line refunded. The rest of the order stays intact.</p>
  </div>`
}
function home() {
  nav('public')
  main.innerHTML = `<div class="shell"><section class="hero">
    <div class="hero-copy"><p class="overline"><span></span> Refund workspace for merchants</p>
    <h1>Refund the<br>right item<span>.</span></h1>
    <p class="hero-description">A chipped mug shouldn’t cancel a whole order. Match the complaint to the affected item, review the amount, and keep the refund receipt.</p>
    <div class="actions"><a class="btn primary" href="/signup">Create an account ${icon('arrow',19)}</a><a class="btn outline" href="/intro">${icon('play',18)} See how it works</a></div></div>
    ${graphic()}
    </section>
    <section class="feature-row" aria-label="What Rekeep does">
      <article><span class="tile">${icon('quote')}</span><h2>See what the customer said</h2><p>Rekeep highlights the wording it used to suggest an item.</p></article>
      <article><span class="tile">${icon('box')}</span><h2>Choose the affected line</h2><p>Review the variant and its price before you approve anything.</p></article>
      <article><span class="tile">${icon('receipt')}</span><h2>Keep a refund record</h2><p>Find the amount, item, and payment reference in one place.</p></article>
    </section></div>`
}
function intro() {
  nav('public')
  main.innerHTML = `<div class="shell"><section class="intro-page"><div><p class="overline"><span></span> How Rekeep works</p><h1>One item.<br>One refund.</h1><p class="hero-description">Follow a damaged mug from the customer’s message to the refund receipt.</p><a class="btn primary" href="/signup">Create an account ${icon('arrow',18)}</a></div><figure>
  <video controls playsinline preload="metadata" poster="/intro-poster.png" aria-label="How Rekeep handles an item-level refund"><source src="/intro.mp4" type="video/mp4"><track kind="captions" src="/intro.vtt" srclang="en" label="English"><a href="/intro.mp4">Download introduction video</a></video><figcaption>Product introduction · 12 seconds</figcaption></figure></section>
  <section class="feature-row"><article><span class="tile">1</span><h2>Open a case</h2><p>Add the order items and paste the customer’s message.</p></article><article><span class="tile">2</span><h2>Review the match</h2><p>Confirm the exact line and compare the refund with the original order total.</p></article><article><span class="tile">3</span><h2>Save the receipt</h2><p>Record a refund you issued with your payment provider, or use a connected Braintree Sandbox account.</p></article></section></div>`
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
    <aside class="auth-art"><span class="auth-brand"><img src="/mark.svg" width="56" height="56" alt=""></span><div><h2>A clear record for every refund.</h2><p>Find the complaint, order line, and receipt together.</p></div></aside></div>`
}
function confirmation(message, link) {
  nav('auth')
  main.innerHTML = `<div class="shell simple"><section class="panel"><span class="tile">${icon('shield')}</span><h1>${safe(message)}</h1><p>${safe(link)}</p><a class="btn primary" href="/signin">Back to sign in</a></section></div>`
}
async function confirmLink() {
  const tokens = new URLSearchParams(location.hash.slice(1))
  history.replaceState(null, '', '/confirm')
  if (!tokens.get('access_token') || !tokens.get('refresh_token')) return confirmation('Check your confirmation link.', 'Open the confirmation link from your email. If you already confirmed it, sign in.')
  try {
    await api('confirm', { token: tokens.get('access_token'), refresh: tokens.get('refresh_token') })
    location.replace('/workspace')
  } catch (error) { confirmation('Couldn’t confirm your email.', error.message) }
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
async function install() {
  if (installEvent) {
    const prompt = installEvent
    installEvent = undefined
    await prompt.prompt()
  } else {
    show('Install Rekeep', '<div class="stack"><p>On iPhone, open Safari’s Share menu and choose <strong>Add to Home Screen</strong>.</p><p>In Chrome, open the browser menu and look for <strong>Install Rekeep</strong> or <strong>Add to Home screen</strong>.</p></div>')
  }
}
function reindex() {
  const rows = dialog.querySelectorAll('.order-fields')
  rows.forEach((row, index) => { row.querySelector('legend').textContent = 'Item ' + (index + 1) })
  const add = dialog.querySelector('.add-line')
  if (add) add.disabled = rows.length >= 10
}
document.addEventListener('click', async (event) => {
  const control = event.target.closest('[data-action],[data-filter],[data-case],[data-item],.back-mobile')
  if (!control || control.tagName === 'FORM' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
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
  if (action === 'install') await install()
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
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installEvent = event })
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
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
