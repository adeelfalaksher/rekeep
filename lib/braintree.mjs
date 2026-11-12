const endpoint = 'https://payments.sandbox.braintree-api.com/graphql'
const transactionFields = 'id status orderId amount { value currencyCode }'
const refundFields = `${transactionFields} refundedTransaction { id }`
const refundable = new Set(['SETTLING', 'SETTLED'])
const accepted = new Set(['SUBMITTED_FOR_SETTLEMENT', 'SETTLING', 'SETTLED'])
const failed = new Set(['SETTLEMENT_DECLINED', 'FAILED', 'PROCESSOR_DECLINED', 'GATEWAY_REJECTED', 'VOIDED'])
const decimal = (cents) => (cents / 100).toFixed(2)
export const sandboxRefundStatus = (status) => status === 'SETTLED' ? 'settled' : accepted.has(status) ? 'submitted' : failed.has(status) ? 'failed' : null

export function sandboxGateway(env, fetcher = fetch) {
  const { BRAINTREE_PUBLIC_KEY: user, BRAINTREE_PRIVATE_KEY: pass } = env
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
  const checkRefund = (record, id, orderId, amount) => checkMoney(record, amount, orderId) && record.refundedTransaction?.id === id

  return {
    async findSettledPayment(reference, orderId, cents) {
      const lookup = async (id) => (await graph(
        `query ($id: ID!) { node(id: $id) { ... on Transaction { ${transactionFields} } } }`, { id },
      )).node
      let payment
      if (/^[a-z0-9]{6,16}$/i.test(reference)) {
        const { idFromLegacyId } = await graph('query ($legacyId: ID!) { idFromLegacyId(legacyId: $legacyId, type: TRANSACTION) }', { legacyId: reference })
        if (idFromLegacyId) payment = await lookup(idFromLegacyId)
      } else {
        payment = await lookup(reference)
      }
      if (!checkMoney(payment, decimal(cents), orderId) || !refundable.has(payment.status)) throw new Error('This settled transaction does not match the order.')
      return payment.id
    },
    async refund(id, orderId, cents) {
      const refund = { amount: decimal(cents), orderId }
      const result = await mutate('refundTransaction', { transactionId: id, refund }, refundFields, 'refund')
      if (!checkRefund(result, id, orderId, refund.amount) || !sandboxRefundStatus(result.status)) throw new Error('Braintree could not confirm the refund.')
      return { reference: result.id, status: result.status }
    },
    async checkRefund(reference, paymentId, orderId, cents) {
      const amount = decimal(cents)
      let refund
      if (reference === orderId) {
        const result = await graph(
          `query ($input: RefundSearchInput!) { search { refunds(input: $input) { edges { node { ${refundFields} } } } } }`,
          { input: { orderId: { is: orderId } } },
        )
        const matches = result.search?.refunds?.edges?.map(({node}) => node).filter(node => checkRefund(node, paymentId, orderId, amount)) ?? []
        if (matches.length !== 1) return null
        refund = matches[0]
      } else {
        refund = (await graph(`query ($id: ID!) { node(id: $id) { ... on Refund { ${refundFields} } } }`, { id: reference })).node
        if (refund?.id !== reference || !checkRefund(refund, paymentId, orderId, amount)) return null
      }
      const status = sandboxRefundStatus(refund.status)
      return status ? { reference: refund.id, status } : null
    },
  }
}
