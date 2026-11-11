import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
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

test('app serves all public routes and blocks unauthenticated or cross-origin writes', async (t) => {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, PORT:'0' }, stdio:['ignore','pipe','inherit'] })
  t.after(() => child.kill())
  const [startup] = await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Rekeep exited') })])
  const base = String(startup).trim().match(/http:\/\/127\.0\.0\.1:\d+/)[0]
  for (const path of ['/', '/intro', '/signup', '/signin', '/workspace', '/confirm']) {
    const response = await fetch(base + path)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Rekeep/)
  }
  assert.equal((await fetch(base + '/api/rekeep?action=cases')).status, 401)
  assert.equal((await fetch(base + '/api/rekeep?action=record', { method:'POST', headers:{ origin:'https://elsewhere.example' } })).status, 403)
  const manifest = await fetch(base + '/manifest.webmanifest').then((response) => response.json())
  assert.equal(manifest.display, 'standalone')
  assert.equal((await fetch(base + '/intro.mp4', { headers: { Range:'bytes=0-63' } })).status, 206)
})
