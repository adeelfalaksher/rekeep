import { createHash } from 'node:crypto'

const endpoint = 'https://payments.sandbox.braintree-api.com/graphql'
const transactionFields = 'id status orderId amount { value currencyCode }'
const refundFields = `${transactionFields} refundedTransaction { id }`
const refundable = new Set(['SETTLING', 'SETTLED'])
const accepted = new Set(['SUBMITTED_FOR_SETTLEMENT', 'SETTLING', 'SETTLED'])
const decimal = (cents) => (cents / 100).toFixed(2)
const requestKey = (id) => createHash('sha256').update(id).digest('hex').slice(0, 32)

export function sandboxGateway(env, fetcher = fetch) {
  const { BRAINTREE_PUBLIC_KEY: user, BRAINTREE_PRIVATE_KEY: pass, BRAINTREE_MERCHANT_ACCOUNT_ID: account } = env
  if (!user || !pass) return null
  const authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`

  async function graph(query, variables) {
    const response = await fetcher(endpoint, {
      method: 'POST', redirect: 'error',
      headers: { Authorization: authorization, 'Braintree-Version': '2019-01-01', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12000), body: JSON.stringify({ query, variables }),
    })
    const result = await response.json()
    if (!response.ok || result.errors?.length || !result.data) throw new Error('Braintree could not confirm the operation.')
    return result.data
  }

  async function mutate(name, input, fields, field = 'transaction') {
    const type = name[0].toUpperCase() + name.slice(1) + 'Input'
    const data = await graph(`mutation ($input: ${type}!) { ${name}(input: $input) { ${field} { ${fields} } } }`, { input })
    return data[name]?.[field]
  }

  const checkMoney = (record, amount, orderId) => record?.id && record.orderId === orderId && record.amount?.currencyCode === 'USD' && Number(record.amount.value) === Number(amount)

  return {
    async findSettledPayment(reference, orderId, cents) {
      const data = await graph(`query ($id: ID!) { node(id: $id) { ... on Transaction { ${transactionFields} } } }`, { id: reference })
      if (!checkMoney(data.node, decimal(cents), orderId) || !refundable.has(data.node.status)) throw new Error('This settled transaction does not match the order.')
      return data.node.id
    },
    async charge(orderId, cents) {
      const transaction = { amount: decimal(cents), orderId }
      if (account) transaction.merchantAccountId = account
      const payment = await mutate('chargePaymentMethod', { paymentMethodId: 'fake-valid-nonce', apiRequestKey: requestKey(orderId), transaction }, transactionFields)
      if (!checkMoney(payment, transaction.amount, orderId) || !accepted.has(payment.status)) throw new Error('Braintree could not confirm the USD test charge.')
      return payment.id
    },
    async settle(id) {
      const data = await graph(`query ($id: ID!) { node(id: $id) { ... on Transaction { id status } } }`, { id })
      if (data.node?.id !== id) throw new Error('Braintree could not find the test charge.')
      if (refundable.has(data.node.status)) return
      const payment = await mutate('sandboxSettleTransaction', { transactionId: id }, 'id status')
      if (payment?.id !== id || !refundable.has(payment.status)) throw new Error('The test charge is not ready for a refund. Try preparing it again.')
    },
    async refund(id, orderId, cents) {
      const refund = { amount: decimal(cents), orderId }
      const result = await mutate('refundTransaction', { transactionId: id, refund }, refundFields, 'refund')
      if (!checkMoney(result, refund.amount, orderId) || result.refundedTransaction?.id !== id || !accepted.has(result.status)) throw new Error('Braintree could not confirm the refund.')
      return { reference: result.id, status: result.status }
    },
  }
}
