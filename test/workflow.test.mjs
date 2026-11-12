import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { runInNewContext } from 'node:vm'
import { analyze, makeCase, total } from '../public/match.mjs'
import { sandboxGateway } from '../lib/braintree.mjs'

const make = (message, items = [
  { name: 'Ceramic mug', variant: 'Blue', price: '18.00' },
  { name: 'Grid notebook', variant: 'Sage', price: '12.00' },
  { name: 'Gel pen', variant: 'Black', price: '8.00' },
]) => makeCase({ orderNumber: 'o-2048', name: 'Merchant QA', message, items })

test('one damaged item is matched to original order cents and evidence', () => {
  const order = make('The blue ceramic mug arrived chipped. The pen and notebook are fine.')
  assert.equal(order.orderNumber, 'O-2048')
  assert.equal(total(order), 3800)
  const match = analyze(order.message, order)
  assert.equal(match.itemId, 'item-1')
  assert.match(match.quote, /arrived chipped/)
  assert.equal(total(order) - order.items[0].cents, 2000)
})

test('same product without a variant and multiple affected items require review', () => {
  const first = make('My ceramic mug was damaged.', [
    { name:'Ceramic mug', variant:'Blue', price:'18.00' },
    { name:'Ceramic mug', variant:'Sage', price:'18.00' },
  ])
  assert.equal(analyze(first.message, first).status, 'manual')
  const second = make('The mug was damaged. The gel pen is missing.')
  assert.equal(analyze(second.message, second).status, 'manual')
})

test('new cases reject malformed or nonpositive item prices', () => {
  assert.throws(() => make('The mug arrived chipped.', [{ name:'Mug', variant:'Blue', price:'-2' }, { name:'Pen', price:'4' }]), /Check item 1/)
})

test('gateway verifies the settled USD order before making a partial refund', async () => {
  const calls = []
  const payloads = [
    { node: { id:'test-id', orderId:'O-2048', status:'SETTLED', amount:{ value:'38.00', currencyCode:'USD' } } },
    { refundTransaction: { refund:{ id:'refund-id', orderId:'RK-test', status:'SUBMITTED_FOR_SETTLEMENT', amount:{ value:'18.00', currencyCode:'USD' }, refundedTransaction:{id:'test-id'} } } },
  ]
  const gateway = sandboxGateway({ BRAINTREE_PUBLIC_KEY:'test', BRAINTREE_PRIVATE_KEY:'test' }, async (url, req) => {
    assert.equal(url, 'https://payments.sandbox.braintree-api.com/graphql')
    calls.push(JSON.parse(req.body))
    return Response.json({ data: payloads.shift() })
  })
  const id = await gateway.findSettledPayment('test-id', 'O-2048', 3800)
  assert.deepEqual(await gateway.refund(id, 'RK-test', 1800), { reference:'refund-id', status:'SUBMITTED_FOR_SETTLEMENT' })
  assert.deepEqual(calls[1].variables.input.refund, { orderId:'RK-test', amount:'18.00' })
})

async function startSite(t, configuration = {}) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, ...configuration, PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  t.after(() => child.kill())
  const [startup] = await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Rekeep exited') })])
  return String(startup).trim().match(/http:\/\/127\.0\.0\.1:\d+/)[0]
}

test('website serves public routes and blocks unauthenticated or cross-origin writes', async (t) => {
  const base = await startSite(t)
  for (const path of ['/', '/intro', '/signup', '/signin', '/workspace', '/confirm']) {
    const response = await fetch(base + path)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Rekeep/)
  }
  assert.equal((await fetch(base + '/api/rekeep?action=cases')).status, 401)
  assert.equal((await fetch(base + '/api/rekeep?action=record', { method:'POST', headers:{ origin:'https://elsewhere.example' } })).status, 403)
  assert.equal((await fetch(base + '/manifest.webmanifest')).status, 404)
  assert.equal((await fetch(base + '/intro.mp4')).status, 404)
  const script = await fetch(base + '/app.mjs').then((response) => response.text())
  assert.match(script, /workflow-tour\.mp4/)
  assert.doesNotMatch(script.slice(script.indexOf('function intro()'), script.indexOf('function authView')), /<video|workflow-tour\.mp4/)
  assert.match(script, /<video[^>]+autoplay[^>]+muted[^>]+loop[^>]+playsinline/)
  assert.doesNotMatch(script, /Replay video|class="media-end"|data-action="watch"/)
  const notFound = await fetch(base + '/unknown-route')
  assert.equal(notFound.status, 404)
  assert.match(await notFound.text(), /Back to homepage/)
  const home = await fetch(base + '/')
  const html = await home.text()
  assert.match(html, /linerefund\.vercel\.app/)
  assert.doesNotMatch(html, /rel="manifest"|mobile-web-app-capable/)
  for (const state of ['inbox','intake','review','record','receipt','filter']) {
    const image = await fetch(base + '/workflow-' + state + '.webp')
    assert.equal(image.status, 200)
    assert.equal(image.headers.get('content-type'), 'image/webp')
    await image.arrayBuffer()
  }
  const video = await fetch(base + '/workflow-tour.mp4')
  assert.equal(video.status, 200)
  assert.equal(video.headers.get('content-type'), 'video/mp4')
  assert.ok((await video.arrayBuffer()).byteLength > 1000)
})

test('accepts a Braintree control-panel transaction ID and verifies its order', async () => {
  const requests = []
  const gateway = sandboxGateway({ BRAINTREE_PUBLIC_KEY:'test', BRAINTREE_PRIVATE_KEY:'test' }, async (_url, request) => {
    const body = JSON.parse(request.body)
    requests.push(body)
    return Response.json({ data: body.variables.legacyId
      ? { idFromLegacyId: 'graph-id' }
      : { node: { id:'graph-id', orderId:'O-2048', status:'SETTLED', amount:{ value:'38.00', currencyCode:'USD' } } } })
  })
  assert.equal(await gateway.findSettledPayment('abc12345', 'O-2048', 3800), 'graph-id')
  assert.equal(requests[0].variables.legacyId, 'abc12345')
  assert.equal(requests[1].variables.id, 'graph-id')
  await assert.rejects(() => gateway.findSettledPayment('abc12345', 'OTHER-ORDER', 3800))
})

test('the retiring worker removes only previous Rekeep caches and unregisters', async (t) => {
  const base = await startSite(t)
  const worker = await fetch(base + '/sw.js').then((response) => response.text())
  const events = new Map()
  const cleared = []
  let retired = false
  runInNewContext(worker, {
    self: { addEventListener: (event, callback) => events.set(event, callback), registration: { unregister: async () => { retired = true } } },
    caches: { keys: async () => ['rekeep-public-1', 'rekeep-public-2', 'another-site'], delete: async (key) => { cleared.push(key) } },
  })
  let activation
  events.get('activate')({ waitUntil: (work) => { activation = work } })
  await activation
  assert.deepEqual(cleared, ['rekeep-public-1', 'rekeep-public-2'])
  assert.equal(retired, true)
  assert.equal(events.has('fetch'), false)
})

test('the website handles email confirmation and records an external refund through the API', async (t) => {
  const id = '8de35b10-78c0-4f9b-a7af-f93e9c09bff4'
  const origin = 'http://127.0.0.1:4173'
  let accountConfirmed = false
  let caseRecord
  let recorded = 0
  const provider = createServer(async (req, res) => {
    const path = new URL(req.url, origin)
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const data = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
    const send = (status, response) => {
      res.writeHead(status, { 'Content-Type':'application/json' })
      res.end(JSON.stringify(response))
    }
    if (path.pathname === '/auth/v1/signup') {
      if (path.searchParams.get('redirect_to') !== origin + '/confirm') return send(400, {})
      return send(200, { user:{ email:data.email } })
    }
    if (path.pathname === '/auth/v1/token') {
      return accountConfirmed
        ? send(200, { access_token:'test_access', refresh_token:'test_refresh', expires_in:3600 })
        : send(403, { error_code:'email_not_confirmed' })
    }
    if (req.headers.authorization !== 'Bearer test_access') return send(401, {})
    if (path.pathname === '/auth/v1/user') return send(200, { id:'sample-user', email:'merchant@example.com', user_metadata:{shop:'Example shop'} })
    if (path.pathname === '/rest/v1/rekeep_cases') {
      if (req.method === 'POST') caseRecord = { ...data, id, refund:null }
      return send(req.method === 'POST' ? 201 : 200, caseRecord ? [caseRecord] : [])
    }
    if (path.pathname === '/rest/v1/rekeep_refunds' && req.method === 'POST') {
      const line = caseRecord.items.find((item) => item.id === data.item_id)
      caseRecord.refund = { source:'external', status:'recorded', item_id:line.id, amount_cents:line.cents, reference:data.reference }
      recorded++
      return send(201, {})
    }
    return send(404, {})
  }).listen(0, '127.0.0.1')
  t.after(() => provider.close())
  await once(provider, 'listening')
  const base = await startSite(t, { APP_ORIGIN:origin, SUPABASE_URL:'http://127.0.0.1:' + provider.address().port, SUPABASE_PUBLISHABLE_KEY:'test-publishable' })
  const url = (action, caseId) => base + '/api/rekeep?' + new URLSearchParams({ action, ...(caseId ? {id:caseId} : {}) })
  const post = (action, body, cookie, caseId) => fetch(url(action, caseId), {
    method:'POST', headers:{ 'Content-Type':'application/json', origin, ...(cookie ? {cookie} : {}) }, body:JSON.stringify(body),
  })
  const credentials = { email:'merchant@example.com', password:'local-fixture-pass', shop:'Example shop' }
  assert.deepEqual(await post('signup', credentials).then((response) => response.json()), {signedIn:false})
  assert.equal((await post('signin', credentials)).status, 403)
  accountConfirmed = true
  const signin = await post('signin', credentials)
  assert.equal(signin.status, 200)
  const cookie = signin.headers.getSetCookie().map((value) => value.split(';',1)[0]).join('; ')
  assert.match(cookie, /rk_access=test_access/)
  assert.equal((await fetch(url('session'), {headers:{cookie}}).then((response) => response.json())).shop, 'Example shop')
  const create = await post('new', { orderNumber:'ORDER-2048', name:'Example customer', message:'The mug arrived damaged.', items:[{name:'Mug',price:'18.00'},{name:'Notebook',price:'20.00'}] }, cookie)
  assert.equal(create.status, 201)
  const record = () => post('record', { item:'item-1', reference:'refund-2048' }, cookie, id)
  assert.equal((await record().then((response) => response.json())).case.refund.amount_cents, 1800)
  assert.equal((await record()).status, 200)
  assert.equal(recorded, 1)
  const cases = await fetch(url('cases'), {headers:{cookie}}).then((response) => response.json())
  assert.equal(cases.cases[0].refund.reference, 'refund-2048')
})

test('neutral product details do not become refund suggestions', () => {
  for (const message of [
    'The mug is in perfect condition, can you refund it?',
    'The mug is a different size from my old one.',
    'I ordered a different mug last time.',
    "The mug isn't damaged.",
    'The mug arrived broken. Can I return the notebook?',
  ]) {
    const order = make(message)
    assert.equal(analyze(message, order).status, 'manual', message)
  }
  const missing = make('I did not receive the notebook.')
  assert.equal(analyze(missing.message, missing).itemId, 'item-2')
  const wrong = make('You sent the wrong mug.')
  assert.equal(analyze(wrong.message, wrong).itemId, 'item-1')
})

test('gateway refresh confirms the original payment, order, amount and currency without issuing a new refund', async () => {
  const refund = {
    id:'gateway-refund', orderId:'RK-test', status:'SETTLED',
    amount:{ value:'18.00', currencyCode:'USD' }, refundedTransaction:{id:'original-payment'},
  }
  const gateway = sandboxGateway({ BRAINTREE_PUBLIC_KEY:'test', BRAINTREE_PRIVATE_KEY:'test' }, async (_url, req) => {
    const { query, variables } = JSON.parse(req.body)
    assert.match(query, /^query/)
    if (variables.id) return Response.json({ data:{ node:refund } })
    assert.deepEqual(variables.input, {orderId:{is:'RK-test'}})
    return Response.json({ data:{search:{refunds:{edges:[{node:refund}]}}} })
  })
  assert.deepEqual(await gateway.checkRefund('gateway-refund', 'original-payment', 'RK-test', 1800), {reference:'gateway-refund',status:'settled'})
  assert.deepEqual(await gateway.checkRefund('RK-test', 'original-payment', 'RK-test', 1800), {reference:'gateway-refund',status:'settled'})
  assert.equal(await gateway.checkRefund('gateway-refund', 'different-payment', 'RK-test', 1800), null)
  assert.equal(await gateway.checkRefund('gateway-refund', 'original-payment', 'RK-test', 1200), null)
  refund.status = 'SETTLEMENT_DECLINED'
  assert.equal((await gateway.checkRefund('gateway-refund', 'original-payment', 'RK-test', 1800)).status, 'failed')
})

test('a customer receipt is shareable only for a recorded refund or a clearly labeled settled Sandbox test', async () => {
  const { refundState, refundReceipt } = await import('../public/refund.mjs')
  const order = make('Private customer message. The mug is damaged.')
  const entry = {...order, order_number:order.orderNumber, customer:'Private customer'}
  const refund = {item_id:'item-1',amount_cents:1800,source:'braintree_sandbox',status:'submitted',reference:'test-refund',created_at:'2026-11-12T10:00:00Z'}
  assert.equal(refundState(refund), 'Refund processing')
  assert.equal(refundReceipt(entry,refund,'Shop'), null)
  assert.equal(refundReceipt(entry,{...refund,status:'failed'},'Shop'), null)
  const sample = refundReceipt(entry,{...refund,status:'settled'},'Shop')
  assert.match(sample.text, /Sandbox test receipt/)
  assert.match(sample.text, /No real money moved/)
  const receipt = refundReceipt(entry,{...refund,source:'external',status:'recorded',reference:'ref-123'},'Shop')
  assert.match(receipt.text, /Ceramic mug \(Blue\)/)
  assert.match(receipt.text, /Refund amount: \$18\.00/)
  assert.match(receipt.text, /Remaining on order: \$20\.00/)
  assert.match(receipt.text, /ref-123/)
  assert.doesNotMatch(receipt.text, /Private customer|test-refund/)
})
