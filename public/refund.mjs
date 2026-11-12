import { money, total } from './match.mjs'

export function refundState(refund) {
  switch (refund?.status) {
    case 'recorded':
    case 'settled': return 'Resolved'
    case 'submitted': return 'Refund processing'
    case 'pending': return 'Needs verification'
    case 'failed': return 'Refund failed'
    default: return 'Open'
  }
}

export function refundReceipt(entry, refund, shop) {
  if (refundState(refund) !== 'Resolved') return null
  const item = entry.items.find(line => line.id === refund.item_id)
  if (!item) return null
  const sandbox = refund.source === 'braintree_sandbox'
  const title = sandbox ? 'Sandbox test receipt' : 'Customer refund receipt'
  const note = sandbox
    ? 'PayPal Braintree Sandbox. No real money moved.'
    : 'This receipt records the refund reference supplied by the store. Your payment provider can confirm when the money reaches your account.'
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(refund.created_at))
  const details = [
    ['Order', '#' + entry.order_number],
    ['Item', item.detail && item.detail !== 'Order item' ? `${item.name} (${item.detail})` : item.name],
    ['Original payment', money(total(entry))],
    ['Refund amount', money(refund.amount_cents)],
    ['Remaining on order', money(total(entry) - refund.amount_cents)],
    ['Refund reference', refund.reference],
    ['Recorded', date],
  ]
  const text = [title, shop, '', ...details.map(([label,value]) => `${label}: ${value}`), '', note].join('\n')
  return { title, note, details, text }
}
