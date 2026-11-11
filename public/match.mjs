export const total = (order) => order.items.reduce((sum, item) => sum + item.cents, 0)
export const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
export const maxMessage = 1600

const examples = [
  ['damaged', 'arrived damaged broken cracked chipped chip dented shattered torn ripped scratched defective leaking crushed'],
  ['damaged', 'arrived with a chip on the rim the handle snapped damage'],
  ['missing', 'missing omitted absent never arrived was left out not included'],
  ['missing', 'missing from the box was not in the package did not receive never received'],
  ['wrong item', 'wrong incorrect different color size model sent instead mix up mismatch'],
  ['wrong item', 'they sent the wrong item color instead of what i ordered'],
  ['other', 'fine okay good perfect everything else arrived delivered thanks received happy works'],
  ['other', 'arrived today is fine no damage no problem intact looks good'],
]

const words = (value) => value.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? []
const vocabulary = new Set(examples.flatMap(([, sample]) => words(sample)))
const models = new Map()
for (const [label, sample] of examples) {
  const model = models.get(label) ?? { count: 0, terms: new Map() }
  for (const word of words(sample)) {
    model.terms.set(word, (model.terms.get(word) ?? 0) + 1)
    model.count++
  }
  models.set(label, model)
}

function classify(clause) {
  if (/\b(?:no (?:damage|issues?|problems?)|not (?:damaged|broken|chipped|wrong|missing)|(?:is|are|was|were) fine)\b/i.test(clause)) return 'other'
  const tokens = words(clause).filter((word) => vocabulary.has(word))
  const scores = Array.from(models, ([label, model]) => ({
    label,
    score: tokens.reduce((sum, word) => sum + Math.log(((model.terms.get(word) ?? 0) + 1) / (model.count + vocabulary.size)), 0),
  })).sort((a, b) => b.score - a.score)
  if (!tokens.length || scores[0].score - scores[1].score < 0.25) return 'other'
  return scores[0].label
}

function mentions(clause, order) {
  const normalized = ` ${words(clause).join(' ')} `
  const hits = order.items.flatMap((item) => item.terms.flatMap((term) => {
    const span = ` ${term} `
    const matches = []
    for (let start = normalized.indexOf(span); start !== -1; start = normalized.indexOf(span, start + 1)) {
      matches.push({ item, start, end: start + span.length })
    }
    return matches
  }))
  return hits.filter((hit) => !hits.some((other) => other.start <= hit.start && other.end >= hit.end && other.end - other.start > hit.end - hit.start)).map(({ item }) => item.id)
}

export function analyze(message, order) {
  const evidence = []
  for (const chunk of message.match(/[^.!?;\n]+[.!?]?/g) ?? []) {
    for (const part of chunk.split(/\s+(?:but|however|while|although)\s+|,\s*/i)) {
      const quote = part.trim()
      const ids = [...new Set(mentions(quote, order))]
      if (!ids.length) continue
      const reason = classify(quote)
      if (reason !== 'other' || /\b(?:refund|replace|return)\b/i.test(quote)) evidence.push({ ids, reason, quote })
    }
  }
  const supported = evidence.filter(({ reason }) => reason !== 'other')
  const ids = [...new Set((supported.length ? supported : evidence).flatMap((entry) => entry.ids))]
  if (ids.length !== 1) return { status: 'manual', candidates: ids, quote: supported[0]?.quote ?? evidence[0]?.quote ?? '', reason: ids.length > 1 ? 'More than one item could match.' : 'The message does not identify an item clearly.' }
  const match = supported.find((entry) => entry.ids.includes(ids[0]))
  if (!match) return { status: 'manual', candidates: ids, quote: evidence[0]?.quote ?? '', reason: 'Confirm which item had an issue.' }
  return { status: 'match', itemId: ids[0], quote: match.quote, reason: match.reason }
}

export function makeCase(input) {
  const orderNumber = String(input.orderNumber ?? '').trim()
  const name = String(input.name ?? '').trim()
  const message = String(input.message ?? '').trim()
  const lines = Array.isArray(input.items) ? input.items : []
  if (!/^[\p{L}\p{N}-]{1,24}$/u.test(orderNumber) || !name || name.length > 64) throw new Error('Enter a customer name and a short order number.')
  if (!message || message.length > maxMessage) throw new Error('Enter a customer message up to 1,600 characters.')
  if (lines.length < 2 || lines.length > 10) throw new Error('Add 2 to 10 order items, one per line.')
  const items = lines.map((line, index) => {
    const label = typeof line?.name === 'string' ? line.name.trim() : ''
    const variant = typeof line?.variant === 'string' ? line.variant.trim() : ''
    const amount = typeof line?.price === 'string' ? line.price.trim() : ''
    if (!label || label.length > 80 || !words(label).length || variant.length > 50 || !/^\d{1,5}(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      throw new Error(`Check item ${index + 1}. Enter a name and a positive price in USD.`)
    }
    const parts = words(label)
    const detail = words(variant ?? '')
    const terms = [...new Set([parts.join(' '), parts.at(-1), detail.join(' '), [...detail, ...parts].join(' ')].filter(Boolean))]
    const [whole, fraction = ''] = amount.split('.')
    return { id: `item-${index + 1}`, name: label, detail: variant || 'Order item', cents: Number(whole) * 100 + Number(fraction.padEnd(2, '0')), kind: 'case', terms }
  })
  const initials = name.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase()
  return { orderNumber: orderNumber.toUpperCase(), name, message, initials, items }
}
