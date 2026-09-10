// Local-only contract tests: real services/routes + file repository, fake provider transport.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
const load = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tablo-payments-'));
process.chdir(temp);
process.env.NODE_ENV = 'test';
process.env.YOOKASSA_MODE = 'test';
process.env.YOOKASSA_SHOP_ID = '123';
process.env.YOOKASSA_SECRET_KEY = 'test_fixture_not_a_real_key';
process.env.NEXT_PUBLIC_APP_URL = 'https://test.example';
for (const key of ['REDIS_URL','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','KV_REST_API_URL','KV_REST_API_TOKEN','VERCEL_ENV','YOOKASSA_CRON_SECRET']) delete process.env[key];
const menu = { categories: [{ id: 'coffee', isActive: true }], addonGroups: [], menuItems: [{ id: 'coffee', kind: 'drink', name: 'Кофе', categoryId: 'coffee', basePrice: 123.45, description: '250 мл', isActive: true, inStock: true, variants: [], addonGroupIds: [] }] };
const deferred = [];
const originalLoad = Module._load;
Module._load = function(id, parent, main) {
  if (id === 'server-only') return {};
  if (id === 'next/server') return { after: callback => deferred.push(callback) };
  if (id === '@/lib/tenantSettingsStore') return { getTenantId: () => 'test-tenant' };
  if (id === '@/lib/storefrontService') return { getStorefront: async () => ({ menu }) };
  if (id === '@/lib/storefrontAvailabilityService') return { getStorefrontAvailability: async () => ({ items: {} }) };
  if (id.startsWith('@/')) id = path.join(root, id.slice(2)) + '.ts';
  return originalLoad.call(this, id, parent, main);
};
Module._extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const repo = load('../lib/serverOrderRepository.ts');
const orders = load('../lib/serverOrderService.ts');
const payments = load('../lib/serverPaymentService.ts');
const client = load('../lib/yookassaClient.ts');
const receipts = load('../lib/yookassaReceipt.ts');
const fiscal = load('../lib/serverFiscalService.ts');
const emailValidation = load('../lib/orderEmail.ts');
const statusRoute = load('../app/api/bar/orders/[id]/status/route.ts');
const fiscalCron = load('../app/api/cron/yookassa-fiscal/route.ts');
const webhook = load('../app/api/yookassa/webhook/route.ts');
const paymentRoute = load('../app/api/orders/[id]/payment/route.ts');
const orderRoute = load('../app/api/orders/route.ts');
const input = { customerName: 'Тест', phone: '+79999999999', email: 'buyer@example.ru', personalDataConsent: true, personalDataConsentVersion: '2026-08-24', items: [{ productId: 'coffee', quantity: 2, selection: { addonOptionIdsByGroupId: {} } }], total: 1, paymentStatus: 'succeeded' };
let calls = [], remoteByKey = new Map(), remoteById = new Map(), failure = null;
let receiptsByKey = new Map(), receiptsById = new Map(), receiptFailure = null;
let initialReceiptRegistration = 'succeeded';
if (process.env.TABLO_TEST_REDIS_PORT) {
  assert.match(process.env.TABLO_TEST_REDIS_PORT, /^\d{4,5}$/);
  process.env.REDIS_URL = `redis://127.0.0.1:${process.env.TABLO_TEST_REDIS_PORT}`;
}
global.fetch = async (url, options) => {
  assert.ok(url.startsWith('https://api.yookassa.ru/v3/'));
  calls.push({ url, options });
  if (failure) return failure(url, options);
  if (url.includes('/v3/receipts')) {
    const respond = () => {
      if (options.method === 'POST') {
        const body = JSON.parse(options.body), key = options.headers['Idempotence-Key'];
        if (!receiptsByKey.has(key)) {
          const receipt = { id: `rt-${randomUUID()}`, type: body.type, payment_id: body.payment_id,
            status: 'succeeded', items: body.items };
          receiptsByKey.set(key, { receipt, body: options.body }); receiptsById.set(receipt.id, receipt);
        }
        assert.equal(receiptsByKey.get(key).body, options.body);
        return Response.json(receiptsByKey.get(key).receipt);
      }
      return Response.json(receiptsById.get(url.split('/').pop()));
    };
    return receiptFailure ? receiptFailure(url, options, respond) : respond();
  }
  if (options.method === 'POST') {
    const body = JSON.parse(options.body), key = options.headers['Idempotence-Key'];
    if (!remoteByKey.has(key)) {
      const payment = { id: randomUUID(), status: 'pending', paid: false, test: process.env.YOOKASSA_MODE === 'test', receipt_registration: initialReceiptRegistration, amount: body.amount, metadata: body.metadata, recipient: { account_id: '123' }, confirmation: { type: 'redirect', confirmation_url: 'https://yoomoney.ru/test-payment' } };
      remoteByKey.set(key, payment); remoteById.set(payment.id, payment);
    }
    return Response.json(remoteByKey.get(key));
  }
  const remote = remoteById.get(url.split('/').pop());
  return remote ? Response.json(remote) : new Response('{}', { status: 404 });
};
async function create() {
  const result = await orders.createServerOrder(input, randomUUID());
  return { result, order: await repo.getPersistedOrder('test-tenant', result.order.id) };
}
async function attached() {
  const { result, order } = await create();
  const saved = await payments.ensureOrderPayment(order);
  return { result, order: saved, remote: remoteById.get(saved.payment.id) };
}
function notification(id) { return { type: 'notification', event: 'payment.succeeded', object: { id, status: 'succeeded', amount: { value: '0.01' }, metadata: { orderId: randomUUID() } } }; }
after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('disabled, live credentials and production cannot issue provider calls', async () => {
  const count = calls.length;
  process.env.YOOKASSA_MODE = 'disabled'; assert.equal(client.getYookassaConfig(), null);
  await assert.rejects(client.yookassaRequest('payments'), { code: 'PAYMENTS_DISABLED' });
  process.env.YOOKASSA_MODE = 'live'; assert.throws(client.getYookassaConfig);
  process.env.YOOKASSA_MODE = 'test'; process.env.VERCEL_ENV = 'production'; assert.throws(client.getYookassaConfig);
  delete process.env.VERCEL_ENV;
  process.env.YOOKASSA_SECRET_KEY = 'live_not_real'; assert.throws(client.getYookassaConfig);
  process.env.YOOKASSA_SECRET_KEY = 'test_fixture_not_a_real_key'; assert.equal(calls.length, count);
});
test('order prices/status are server owned; token gates reads; unpaid orders hidden', async () => {
  const { result, order } = await create();
  assert.equal(order.totalMinor, 24690); assert.equal(result.order.paymentStatus, 'pending');
  assert.equal(result.order.payment, undefined); assert.equal(result.order.phone, undefined);
  assert.equal((await orders.listBaristaOrders()).some(o => o.id === order.id), false);
  await assert.rejects(orders.updateServerOrderStatus(order.id, 'in_progress'), { code: 'ORDER_UNPAID' });
  await assert.rejects(payments.getAuthorizedPaymentOrder(order.id, 'wrong'), { status: 404 });
  assert.equal((await payments.getAuthorizedPaymentOrder(order.id, result.accessToken)).id, order.id);
});
test('concurrent order and payment requests deduplicate; request uses frozen RUB amount and return URL', async () => {
  const key = randomUUID();
  const results = await Promise.all(Array.from({length: 8}, () => orders.createServerOrder(input, key)));
  assert.equal(new Set(results.map(r => r.order.id)).size, 1);
  const order = await repo.getPersistedOrder('test-tenant', results[0].order.id);
  const saved = await Promise.all(Array.from({length: 8}, () => payments.ensureOrderPayment(order)));
  assert.equal(new Set(saved.map(o => o.payment.id)).size, 1);
  const body = JSON.parse(calls.filter(c => c.options.method === 'POST').at(-1).options.body);
  assert.deepEqual(body.amount, { value: '246.90', currency: 'RUB' });
  assert.equal(body.capture, true); assert.equal(body.confirmation.type, 'redirect');
  assert.equal(body.confirmation.return_url, `https://test.example/payment/return?orderId=${order.id}`);
});
test('forged succeeded notification cannot mark pending provider payment paid', async () => {
  const { order } = await attached();
  await payments.processPaymentNotification(notification(order.payment.id));
  assert.equal((await repo.getPersistedOrder(order.tenantId, order.id)).payment.status, 'pending');
});
test('success webhook is atomic and idempotent, exposes order once and preserves fulfilment', async () => {
  const { order, remote } = await attached(); remote.status = 'succeeded'; remote.paid = true;
  await Promise.all(Array.from({length: 8}, () => payments.processPaymentNotification(notification(remote.id))));
  let saved = await repo.getPersistedOrder(order.tenantId, order.id);
  assert.equal(saved.payment.status, 'succeeded'); assert.equal(saved.payment.revision, 2);
  const paidAt = saved.payment.paidAt;
  await orders.updateServerOrderStatus(order.id, 'in_progress');
  await payments.processPaymentNotification(notification(remote.id));
  saved = await repo.getPersistedOrder(order.tenantId, order.id);
  assert.equal(saved.status, 'in_progress'); assert.equal(saved.payment.paidAt, paidAt);
  assert.equal((await orders.listBaristaOrders()).filter(o => o.id === order.id).length, 1);
});
test('wrong amount/currency/tenant/order/shop/id/test/paid never confirms payment', async () => {
  for (const change of [r => r.amount.value = '0.01', r => r.amount.currency = 'USD', r => r.metadata.tenantId = 'other', r => r.metadata.orderId = randomUUID(), r => r.recipient.account_id = '456', r => r.id = randomUUID(), r => r.test = false, r => r.paid = false]) {
    const { order, remote } = await attached(); remote.status = 'succeeded'; remote.paid = true; change(remote);
    await assert.rejects(payments.refreshOrderPayment(order));
    assert.equal((await repo.getPersistedOrder(order.tenantId, order.id)).payment.status, 'pending');
  }
});
test('lost POST response recovered by webhook with same persisted key', async () => {
  const { order } = await create();
  const original = repo.updatePersistedOrderPayment;
  repo.updatePersistedOrderPayment = async () => { throw new Error('storage unavailable'); };
  await assert.rejects(payments.ensureOrderPayment(order));
  repo.updatePersistedOrderPayment = original;
  const remote = remoteByKey.get(order.payment.idempotencyKey); remote.status = 'succeeded'; remote.paid = true;
  await payments.processPaymentNotification(notification(remote.id));
  assert.equal((await repo.getPersistedOrder(order.tenantId, order.id)).payment.id, remote.id);
});
test('ambiguous request older than 23h is blocked without a new payment', async () => {
  const { order } = await create(); order.payment.initiatedAt = new Date(Date.now() - 24*3600000).toISOString();
  const count = calls.length;
  await assert.rejects(payments.ensureOrderPayment(order), { code: 'PAYMENT_RECONCILIATION_REQUIRED' });
  assert.equal(calls.length, count);
});
test('provider 401/403/429/500, timeout and malformed responses are sanitized', async () => {
  for (const status of [401,403,429,500]) {
    failure = async () => new Response('secret raw provider payload', { status });
    await assert.rejects(client.yookassaRequest('payments'), e => !e.message.includes('secret') && e.code === 'PAYMENT_PROVIDER_UNAVAILABLE');
  }
  failure = async () => { throw new DOMException('secret', 'TimeoutError'); };
  await assert.rejects(client.yookassaRequest('payments'), { code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
  failure = async () => Response.json({}); await assert.rejects(client.yookassaRequest('payments'), { code: 'PAYMENT_PROVIDER_INVALID_RESPONSE' });
  failure = async () => new Response('not json'); await assert.rejects(client.yookassaRequest('payments'));
  failure = null;
});
test('return status reads provider, cancellation is terminal; forged URL does not pay', async () => {
  const { result, order, remote } = await attached();
  const context = { params: Promise.resolve({id: order.id}) };
  let response = await paymentRoute.GET(new Request('https://test.example?status=succeeded', {headers: {Authorization: `Bearer ${result.accessToken}`}}), context);
  assert.equal((await response.json()).paymentStatus, 'pending');
  remote.status = 'canceled';
  response = await paymentRoute.GET(new Request('https://test.example', {headers: {Authorization: `Bearer ${result.accessToken}`}}), context);
  assert.equal((await response.json()).paymentStatus, 'canceled');
  const count = calls.length; await payments.ensureOrderPayment(await repo.getPersistedOrder(order.tenantId, order.id)); assert.equal(calls.length, count);
});
test('routes reject unauthenticated/malformed requests and disabled webhook with no-store', async () => {
  const response = await paymentRoute.POST(new Request('https://test.example', {method:'POST'}), {params:Promise.resolve({id:randomUUID()})});
  assert.equal(response.status,404); assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal((await webhook.POST(new Request('https://test.example', {method:'POST',body:'{'}))).status,400);
  process.env.YOOKASSA_MODE = 'disabled';
  assert.equal((await webhook.POST(new Request('https://test.example', {method:'POST',body:JSON.stringify(notification(randomUUID()))}))).status,503);
  const legacy = await orderRoute.POST(new Request('https://test.example', {method:'POST',headers:{'idempotency-key':randomUUID()},body:JSON.stringify(input)}));
  assert.equal(legacy.status,503); assert.equal((await legacy.json()).code,'PAYMENTS_DISABLED');
  process.env.YOOKASSA_MODE = 'test';
});


test('credentials alone never enable orders or payment creation', async () => {
  const count = calls.length;
  delete process.env.YOOKASSA_MODE;
  process.env.YOOKASSA_SECRET_KEY = 'live_fixture_not_a_real_key';
  assert.equal(client.getYookassaConfig(), null);
  await assert.rejects(orders.createServerOrder(input, randomUUID()), { code: 'PAYMENTS_DISABLED' });
  await assert.rejects(client.yookassaRequest('payments', {}, randomUUID()), { code: 'PAYMENTS_DISABLED' });
  assert.equal(calls.length, count);
  process.env.YOOKASSA_MODE = 'test';
  process.env.YOOKASSA_SECRET_KEY = 'test_fixture_not_a_real_key';
});
test('explicit live validates origin and requires configured fiscal retry authentication', async () => {
  const { order } = await create();
  const count = calls.length;
  delete process.env.YOOKASSA_CRON_SECRET;
  process.env.YOOKASSA_MODE = 'live';
  process.env.YOOKASSA_SECRET_KEY = 'live_fixture_not_a_real_key';
  process.env.NEXT_PUBLIC_APP_URL = 'https://kafema-kurort.vercel.app';
  assert.throws(client.getYookassaConfig, { code: 'PAYMENT_RETURN_URL_INVALID' });
  process.env.NEXT_PUBLIC_APP_URL = 'https://kafema-kurort.ru';
  process.env.VERCEL_ENV = 'production';
  assert.equal(client.getYookassaConfig().mode, 'live');
  assert.equal(client.getYookassaConfig().origin, 'https://kafema-kurort.ru');
  await assert.rejects(orders.createServerOrder(input, randomUUID()), { code: 'PAYMENT_FISCAL_RETRY_NOT_CONFIGURED' });
  await assert.rejects(payments.ensureOrderPayment({...order, payment:{...order.payment, mode:'live'}}), { code: 'PAYMENT_FISCAL_RETRY_NOT_CONFIGURED' });
  await assert.rejects(client.yookassaRequest('payments', {}, randomUUID()), { code: 'PAYMENT_FISCAL_RETRY_NOT_CONFIGURED' });
  assert.equal(calls.length, count);
  delete process.env.VERCEL_ENV;
  process.env.NEXT_PUBLIC_APP_URL = 'https://test.example';
  process.env.YOOKASSA_MODE = 'test';
  process.env.YOOKASSA_SECRET_KEY = 'test_fixture_not_a_real_key';
});
test('test intents and preparation-stage records cannot be promoted by switching the env to live', async () => {
  const { order } = await attached();
  process.env.YOOKASSA_MODE = 'live';
  process.env.YOOKASSA_SECRET_KEY = 'live_fixture_not_a_real_key';
  const count = calls.length;
  await assert.rejects(payments.refreshOrderPayment(order), { code: 'PAYMENT_ORDER_MISMATCH' });
  const old = {...order, payment:{...order.payment}}; delete old.payment.mode;
  await assert.rejects(payments.refreshOrderPayment(old), { code: 'PAYMENT_ORDER_MISMATCH' });
  assert.equal(calls.length, count);
  process.env.YOOKASSA_MODE = 'test';
  process.env.YOOKASSA_SECRET_KEY = 'test_fixture_not_a_real_key';
});
test('live verification requires test=false and never confuses a test payment with money received', async () => {
  const { order, remote } = await attached();
  // Existing live payment fixture only: no live POST is allowed even in this test.
  const liveOrder = await repo.updatePersistedOrderPayment(order, {...order.payment, mode:'live'});
  process.env.YOOKASSA_MODE = 'live';
  process.env.YOOKASSA_SECRET_KEY = 'live_fixture_not_a_real_key';
  remote.status = 'succeeded'; remote.paid = true;
  await assert.rejects(payments.refreshOrderPayment(liveOrder), { code:'PAYMENT_VERIFICATION_FAILED' });
  remote.test = false;
  const saved = await payments.refreshOrderPayment(liveOrder);
  assert.equal(saved.payment.status, 'succeeded');
  assert.equal(saved.payment.mode, 'live');
  process.env.YOOKASSA_MODE = 'test';
  process.env.YOOKASSA_SECRET_KEY = 'test_fixture_not_a_real_key';
});
test('legacy unpaid orders and test successes cannot enter the production preparation queue', async () => {
  const { order, remote } = await attached();
  const legacy = {...order, id:randomUUID(), number:'LEGACY', payment:undefined};
  await repo.createPersistedOrder({order:legacy, accessToken:'fixture', idempotencyKey:randomUUID()});
  await assert.rejects(orders.updateServerOrderStatus(legacy.id,'in_progress'), {code:'ORDER_UNPAID'});
  assert.equal((await orders.listBaristaOrders()).some(o=>o.id===legacy.id), false);
  remote.status='succeeded'; remote.paid=true;
  await payments.processPaymentNotification(notification(remote.id));
  process.env.VERCEL_ENV='production';
  await assert.rejects(orders.updateServerOrderStatus(order.id,'in_progress'), {code:'ORDER_UNPAID'});
  assert.equal((await orders.listBaristaOrders()).some(o=>o.id===order.id), false);
  delete process.env.VERCEL_ENV;
});
test('webhook completes a closed-browser order and retry after cancellation never creates a second payment', async () => {
  const { result, order, remote } = await attached();
  remote.status='succeeded'; remote.paid=true;
  await payments.processPaymentNotification(notification(remote.id));
  assert.equal((await orders.getCustomerOrder(order.id,result.accessToken)).paymentStatus,'succeeded');
  const canceled = await attached(); canceled.remote.status='canceled';
  await payments.processPaymentNotification({...notification(canceled.remote.id),event:'payment.canceled'});
  const posts=calls.filter(c=>c.options.method==='POST').length;
  const response=await paymentRoute.POST(new Request('https://test.example',{method:'POST',headers:{Authorization:`Bearer ${canceled.result.accessToken}`}}),{params:Promise.resolve({id:canceled.order.id})});
  assert.equal((await response.json()).paymentStatus,'canceled');
  assert.equal(calls.filter(c=>c.options.method==='POST').length,posts);
});
test('waiting_for_capture is not preparation-ready and delayed pending cannot regress a settled order', async () => {
  const { order, remote }=await attached(); remote.status='waiting_for_capture'; remote.paid=true;
  let current=await payments.refreshOrderPayment(order);
  assert.equal(current.payment.status,'waiting_for_capture');
  await assert.rejects(orders.updateServerOrderStatus(order.id,'in_progress'),{code:'ORDER_UNPAID'});
  remote.status='pending'; remote.paid=false;
  current=await payments.refreshOrderPayment(current); assert.equal(current.payment.status,'waiting_for_capture');
  remote.status='succeeded'; remote.paid=true;
  current=await payments.refreshOrderPayment(current); assert.equal(current.payment.status,'succeeded');
  remote.status='pending'; remote.paid=false;
  await payments.processPaymentNotification({...notification(remote.id),event:'payment.waiting_for_capture'});
  assert.equal((await repo.getPersistedOrder(order.tenantId,order.id)).payment.status,'succeeded');
});

test('webhook POST acknowledges both subscribed events without customer auth and preserves duplicate deliveries', async () => {
  for (const status of ['succeeded', 'canceled']) {
    const { order, remote } = await attached();
    remote.status = status; remote.paid = status === 'succeeded';
    const count = calls.length;
    const deliver = () => webhook.POST(new Request('https://kafema-kurort.ru/api/yookassa/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...notification(remote.id), event: `payment.${status}` }),
    }));
    const responses = await Promise.all(Array.from({ length: 8 }, deliver));
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('location'), null);
      assert.equal(response.headers.get('set-cookie'), null);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.deepEqual(await response.json(), { received: true });
    }
    const saved = await repo.getPersistedOrder(order.tenantId, order.id);
    assert.equal(saved.payment.status, status);
    assert.equal(saved.payment.revision, order.payment.revision + 1);
    assert.equal(Boolean(saved.payment.paidAt), status === 'succeeded');
    assert.equal((await deliver()).status, 200);
    assert.deepEqual(await repo.getPersistedOrder(order.tenantId, order.id), saved);
    assert.equal(calls.length - count, 9);
    assert.ok(calls.slice(count).every(call => call.options.method === 'GET'));
  }
});

test('unknown webhook events return 200 without provider calls or order mutations', async () => {
  const { order, remote } = await attached();
  remote.status = 'succeeded'; remote.paid = true;
  const count = calls.length;
  for (const event of ['refund.succeeded', 'payment.unknown', 'payment_method.active']) {
    const response = await webhook.POST(new Request('https://kafema-kurort.ru/api/yookassa/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...notification(remote.id), event }),
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true });
  }
  assert.equal(calls.length, count);
  assert.deepEqual(await repo.getPersistedOrder(order.tenantId, order.id), order);
});

test('webhook HTTP response never confirms payment from payload or acknowledges a failed provider check', async () => {
  const { order, remote } = await attached();
  const deliver = () => webhook.POST(new Request('https://kafema-kurort.ru/api/yookassa/webhook', {
    method: 'POST', body: JSON.stringify(notification(remote.id)),
  }));
  assert.equal((await deliver()).status, 200);
  assert.deepEqual(await repo.getPersistedOrder(order.tenantId, order.id), order);
  failure = async () => new Response('sensitive provider response', { status: 500 });
  try {
    const response = await deliver();
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
    assert.equal(JSON.stringify(body).includes('sensitive'), false);
    assert.deepEqual(await repo.getPersistedOrder(order.tenantId, order.id), order);
  } finally { failure = null; }
});

test('receipt comes from the server order with no-VAT goods, full prepayment and existing phone', async () => {
  const { order } = await attached();
  const body = JSON.parse(calls.filter(call => call.options.method === 'POST').at(-1).options.body);
  assert.deepEqual(body.receipt, {
    customer: { email: 'buyer@example.ru', phone: '79999999999' }, internet: true,
    items: [{ description: 'Кофе (250 мл)', quantity: 2,
      amount: { value: '123.45', currency: 'RUB' }, vat_code: 1,
      payment_mode: 'full_prepayment', payment_subject: 'commodity', measure: 'piece' }],
  });
  assert.equal(order.payment.receiptVersion, 2);
  assert.equal(body.receipt.customer.email, input.email);
  assert.equal(body.receipt.tax_system_code, undefined);
  assert.equal(body.amount.value, '246.90');
  assert.equal(order.totalMinor, 24690);
});

test('phone normalization uses the existing checkout formats and sends provider digits only', async () => {
  for (const phone of ['+79141234567', '8 (914) 123-45-67', '79141234567', '9141234567', '  +7\u00a0(914) 123-45-67  ']) {
    const result = await orders.createServerOrder({ ...input, phone }, randomUUID());
    const order = await repo.getPersistedOrder('test-tenant', result.order.id);
    assert.equal(order.phone, '+79141234567');
    await payments.ensureOrderPayment(order);
    const body = JSON.parse(calls.filter(call => call.options.method === 'POST').at(-1).options.body);
    assert.equal(body.receipt.customer.phone, '79141234567');
  }
});

test('missing or invalid phone blocks order/payment creation before any provider call', async () => {
  const { order } = await create();
  const count = calls.length;
  for (const phone of [undefined, null, '', ' ', '+7', '123', 'abc79141234567', '+19141234567', '7'.repeat(80), 79141234567]) {
    await assert.rejects(orders.createServerOrder({ ...input, phone }, randomUUID()), { code: 'INVALID_PHONE' });
    await assert.rejects(payments.ensureOrderPayment({ ...order, phone }), { code: 'PAYMENT_RECEIPT_PHONE_REQUIRED' });
  }
  assert.equal(calls.length, count);
});

test('multiple receipt lines include variant/addon prices and quantities without trusting browser prices', async () => {
  const originalCoffee = menu.menuItems[0];
  menu.menuItems[0] = { ...originalCoffee,
    variants: [{ id: 'large', name: '350 мл', priceDelta: 10.01, isActive: true }],
    addonGroupIds: ['milk'],
  };
  menu.menuItems.push({ ...originalCoffee, id: 'cake', kind: 'dessert', name: 'Чизкейк', description: '', basePrice: 45.67 });
  menu.addonGroups.push({ id: 'milk', name: 'Добавки', isActive: true, required: true, selectionType: 'multiple', options: [
    { id: 'oat', name: 'Овсяное молоко', priceDelta: 5.05, isActive: true },
    { id: 'no-sugar', name: 'Без сахара', priceDelta: 0, isActive: true },
  ] });
  try {
    const result = await orders.createServerOrder({ ...input, total: 0.01,
      receipt: { items: [], customer: { phone: '1000' } },
      items: [
        { productId: 'coffee', quantity: 3, name: 'Подмена', unitPriceMinor: 1, lineTotalMinor: 3,
          selection: { variantId: 'large', addonOptionIdsByGroupId: { milk: ['oat', 'no-sugar'] } } },
        { productId: 'cake', quantity: 2, selection: { addonOptionIdsByGroupId: {} } },
      ],
    }, randomUUID());
    const order = await repo.getPersistedOrder('test-tenant', result.order.id);
    const count = calls.length;
    await Promise.all(Array.from({ length: 8 }, () => payments.ensureOrderPayment(order)));
    const posts = calls.slice(count).filter(call => call.options.method === 'POST');
    assert.equal(new Set(posts.map(call => call.options.body)).size, 1);
    assert.equal(new Set(posts.map(call => call.options.headers['Idempotence-Key'])).size, 1);
    const body = JSON.parse(posts[0].options.body);
    assert.equal(body.receipt.items.length, 2);
    assert.equal(body.receipt.items[0].description, 'Кофе (350 мл; Овсяное молоко; Без сахара)');
    assert.deepEqual(body.receipt.items.map(item => [item.amount.value, item.quantity]), [['138.51', 3], ['45.67', 2]]);
    const receiptMinor = body.receipt.items.reduce((sum, item) => sum + Number(item.amount.value.replace('.', '')) * item.quantity, 0);
    assert.equal(receiptMinor, 50687);
    assert.equal(order.totalMinor, receiptMinor);
    assert.equal(body.amount.value, '506.87');
    assert.ok(body.receipt.items.every(item => item.vat_code === 1));
  } finally {
    menu.menuItems[0] = originalCoffee;
    menu.menuItems.pop(); menu.addonGroups.pop();
  }
});

test('receipt rejects inconsistent, zero, fractional and unsafe amounts before creating a payment', async () => {
  const { order } = await create();
  const count = calls.length;
  const item = order.items[0];
  for (const invalidOrder of [
    { ...order, totalMinor: order.totalMinor + 1 },
    { ...order, items: [{ ...item, lineTotalMinor: item.lineTotalMinor + 1 }] },
    { ...order, items: [{ ...item, quantity: 1.5 }] },
    { ...order, items: [{ ...item, quantity: 0 }] },
    { ...order, items: [{ ...item, unitPriceMinor: 0, lineTotalMinor: 0 }], totalMinor: 0 },
    { ...order, items: [{ ...item, unitPriceMinor: 1.01 }] },
    { ...order, items: [{ ...item, unitPriceMinor: Number.MAX_SAFE_INTEGER, quantity: 2, lineTotalMinor: Number.MAX_SAFE_INTEGER * 2 }] },
  ]) {
    await assert.rejects(payments.ensureOrderPayment(invalidOrder), { code: 'PAYMENT_RECEIPT_AMOUNT_MISMATCH' });
  }
  assert.equal(calls.length, count);
});

test('receipt descriptions are readable, normalized and limited to 128 Unicode characters', async () => {
  const { order } = await create();
  const item = order.items[0];
  let receipt = receipts.buildYookassaReceipt({ ...order, items: [{ ...item, name: '  Кофе\n\tс молоком\u0000 ', volume: '', modifiers: [] }] });
  assert.equal(receipt.items[0].description, 'Кофе с молоком');
  receipt = receipts.buildYookassaReceipt({ ...order, items: [{ ...item, name: 'Напиток ' + '🍵'.repeat(200) }] });
  const description = receipt.items[0].description;
  assert.equal(Array.from(description).length, 128);
  assert.ok(description.startsWith('Напиток ')); assert.ok(description.endsWith('…'));
  assert.equal(description.includes('\uFFFD'), false);
  assert.throws(() => receipts.buildYookassaReceipt({ ...order, items: [{ ...item, name: '\n\t' }] }), { code: 'PAYMENT_RECEIPT_DESCRIPTION_INVALID' });
});

test('receipt limits item count and refuses unsupported fiscal categories without guessing', async () => {
  const { order } = await create();
  for (const items of [[], Array.from({ length: 81 }, () => order.items[0])]) {
    assert.throws(() => receipts.buildYookassaReceipt({ ...order, items }), { code: 'PAYMENT_RECEIPT_ITEMS_INVALID' });
  }
  for (const type of ['certificate', 'other', 'combo', undefined]) {
    assert.throws(() => receipts.buildYookassaReceipt({ ...order, items: [{ ...order.items[0], type }] }), { code: 'PAYMENT_RECEIPT_ITEM_UNSUPPORTED' });
  }
});

test('pre-receipt ambiguous intents never reuse their provider key with a changed body', async () => {
  const { order } = await create();
  const legacy = { ...order, payment: { ...order.payment } };
  delete legacy.payment.receiptVersion;
  const count = calls.length;
  await assert.rejects(payments.ensureOrderPayment(legacy), { code: 'PAYMENT_RECONCILIATION_REQUIRED' });
  assert.equal(calls.length, count);
  const { order: attachedOrder, remote } = await attached();
  const attachedLegacy = await repo.updatePersistedOrderPayment(attachedOrder, { ...attachedOrder.payment, receiptVersion: undefined });
  remote.status = 'succeeded'; remote.paid = true;
  assert.equal((await payments.refreshOrderPayment(attachedLegacy)).payment.status, 'succeeded');
});

async function readyForHandover() {
  const item = await attached();
  item.remote.status = 'succeeded'; item.remote.paid = true;
  await payments.processPaymentNotification(notification(item.remote.id));
  await orders.updateServerOrderStatus(item.order.id, 'in_progress');
  await orders.updateServerOrderStatus(item.order.id, 'ready');
  return { ...item, order: await repo.getPersistedOrder('test-tenant', item.order.id) };
}
async function handOut(id) {
  process.env.BARISTA_ACCESS_TOKEN = 'barista_fixture_token_not_real_123456';
  return statusRoute.PATCH(new Request('https://test.example', { method: 'PATCH',
    headers: { Authorization: `Bearer ${process.env.BARISTA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' }),
  }), { params: Promise.resolve({ id }) });
}
async function finishDeferred() {
  await Promise.all(deferred.splice(0).map(callback => callback()));
}
const receiptPosts = () => calls.filter(call => call.url.endsWith('/receipts') && call.options.method === 'POST');
const runFiscalScheduler = (secret) => fiscalCron.GET(new Request('https://test.example/api/cron/yookassa-fiscal', {
  headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
}));

test('email is required and validated on the server and by the shared checkout validator', async () => {
  const count = calls.length;
  for (const email of [undefined, '', ' ', 'bad', 'a@', '@example.ru', 'a@b', 'a b@example.ru', 'a..b@example.ru', 'a@-bad.ru', 'a'.repeat(65)+'@example.ru', 'a@'+('b'.repeat(64))+'.ru']) {
    assert.equal(emailValidation.normalizeOrderEmail(email), null);
    await assert.rejects(orders.createServerOrder({ ...input, email }, randomUUID()), { code: 'INVALID_EMAIL' });
  }
  assert.equal(calls.length, count);
  const result = await orders.createServerOrder({ ...input, email: ' Buyer+receipt@Example.RU ' }, randomUUID());
  const order = await repo.getPersistedOrder('test-tenant', result.order.id);
  assert.equal(order.email, 'Buyer+receipt@example.ru');
  assert.equal(result.order.email, undefined);
  await payments.ensureOrderPayment(order);
  const request = JSON.parse(calls.filter(call => call.options.method === 'POST').at(-1).options.body);
  assert.equal(request.receipt.customer.email, order.email);
  const countAfter = calls.length;
  await assert.rejects(payments.ensureOrderPayment({ ...order, email: undefined }), { code: 'PAYMENT_RECEIPT_EMAIL_REQUIRED' });
  assert.equal(calls.length, countAfter);
});

test('first receipt registration is tracked independently and reconciled without premature settlement', async () => {
  initialReceiptRegistration = 'pending';
  try {
    const { order, remote } = await attached();
    remote.status = 'succeeded'; remote.paid = true;
    await payments.processPaymentNotification(notification(remote.id));
    let current = await repo.getPersistedOrder('test-tenant', order.id);
    assert.equal(current.payment.status, 'succeeded');
    assert.equal(current.fiscal.prepayment.status, 'pending');
    assert.equal(current.fiscal.settlement, undefined);
    const count = receiptPosts().length;
    remote.receipt_registration = 'succeeded';
    await fiscal.processFiscalOrder(order.id, current.fiscal.nextAttemptAt + 1);
    current = await repo.getPersistedOrder('test-tenant', order.id);
    assert.equal(current.fiscal.prepayment.status, 'succeeded');
    assert.equal(current.status, 'new'); assert.equal(receiptPosts().length, count);
  } finally { initialReceiptRegistration = 'succeeded'; }
});

test('handout commits before provider IO and duplicate PATCH/worker calls create one settlement receipt', async () => {
  const { order } = await readyForHandover();
  const count = receiptPosts().length;
  const responses = await Promise.all(Array.from({ length: 8 }, () => handOut(order.id)));
  assert.ok(responses.every(response => response.status === 200));
  const issued = await repo.getPersistedOrder('test-tenant', order.id);
  assert.equal(issued.status, 'completed'); assert.ok(issued.completedAt);
  assert.equal(issued.fiscal.settlement.state, 'pending');
  assert.equal(receiptPosts().length, count);
  assert.ok((await repo.listDueFiscalOrders('test-tenant')).includes(order.id));
  await finishDeferred();
  assert.equal(receiptPosts().length, count + 1);
  const body = JSON.parse(receiptPosts().at(-1).options.body);
  assert.equal(body.payment_id, order.payment.id); assert.equal(body.type, 'payment'); assert.equal(body.send, true);
  assert.equal(body.customer.email, input.email);
  assert.deepEqual(body.settlements, [{ type: 'prepayment', amount: { value: '246.90', currency: 'RUB' } }]);
  assert.ok(body.items.every(item => item.payment_mode === 'full_payment' && item.payment_subject === 'commodity' && item.vat_code === 1 && item.measure === 'piece'));
  const settled = await repo.getPersistedOrder('test-tenant', order.id);
  assert.equal(settled.fiscal.settlement.state, 'succeeded'); assert.ok(settled.fiscal.settlement.receiptId);
  assert.equal(settled.fiscal.settlement.registration, 'succeeded');
  assert.equal(settled.completedAt, issued.completedAt);
  await handOut(order.id); await finishDeferred();
  assert.equal(receiptPosts().length, count + 1);
});

test('unpaid orders cannot be issued or produce a settlement receipt', async () => {
  const { order } = await attached();
  const count = receiptPosts().length;
  assert.equal((await handOut(order.id)).status, 409);
  await finishDeferred(); await fiscal.processFiscalOrder(order.id);
  assert.equal(receiptPosts().length, count);
  assert.equal((await repo.getPersistedOrder('test-tenant', order.id)).fiscal.settlement, undefined);
});

test('temporary receipt failure preserves handout and retry sends the same body and key', async () => {
  const { order } = await readyForHandover();
  const count = receiptPosts().length;
  receiptFailure = () => new Response('private provider failure', { status: 500 });
  try { assert.equal((await handOut(order.id)).status, 200); await finishDeferred(); }
  finally { receiptFailure = null; }
  const pending = await repo.getPersistedOrder('test-tenant', order.id);
  assert.equal(pending.status, 'completed'); assert.equal(pending.fiscal.settlement.state, 'pending');
  assert.equal(pending.fiscal.lastError, 'PAYMENT_PROVIDER_UNAVAILABLE'); assert.ok(pending.fiscal.nextAttemptAt);
  await fiscal.processFiscalOrder(order.id, pending.fiscal.nextAttemptAt + 1);
  const attempts = receiptPosts().slice(count);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].options.body, attempts[1].options.body);
  assert.equal(attempts[0].options.headers['Idempotence-Key'], attempts[1].options.headers['Idempotence-Key']);
  const settled = await repo.getPersistedOrder('test-tenant', order.id);
  assert.equal(settled.fiscal.settlement.state, 'succeeded'); assert.equal(settled.completedAt, pending.completedAt);
});

test('lost receipt response is recovered with its persisted key without a second registered receipt', async () => {
  const { order } = await readyForHandover();
  const count = receiptsByKey.size;
  receiptFailure = async (_url, _options, respond) => { respond(); throw new DOMException('Lost response', 'TimeoutError'); };
  try { await handOut(order.id); await finishDeferred(); }
  finally { receiptFailure = null; }
  const pending = await repo.getPersistedOrder('test-tenant', order.id);
  assert.equal(pending.fiscal.settlement.receiptId, undefined);
  assert.ok(pending.fiscal.settlement.firstAttemptAt);
  await fiscal.processFiscalOrder(order.id, pending.fiscal.nextAttemptAt + 1);
  assert.equal(receiptsByKey.size, count + 1);
  assert.equal((await repo.getPersistedOrder('test-tenant', order.id)).fiscal.settlement.state, 'succeeded');
});

test('a known pending receipt is polled by ID, including beyond the POST idempotency window', async () => {
  const { order } = await readyForHandover();
  receiptFailure = async (_url, _options, respond) => {
    const result = await respond().json(); result.status = 'pending';
    receiptsById.get(result.id).status = 'pending';
    return Response.json(result);
  };
  try { await handOut(order.id); await finishDeferred(); }
  finally { receiptFailure = null; }
  const current = await repo.getPersistedOrder('test-tenant', order.id);
  const count = receiptPosts().length;
  assert.equal(current.fiscal.settlement.registration, 'pending');
  receiptsById.get(current.fiscal.settlement.receiptId).status = 'succeeded';
  await fiscal.processFiscalOrder(order.id, Date.now() + 2 * 86400_000);
  assert.equal(receiptPosts().length, count);
  assert.equal((await repo.getPersistedOrder('test-tenant', order.id)).fiscal.settlement.state, 'succeeded');
});

test('an ambiguous receipt older than 23h requires review and never gets a fresh POST/key', async () => {
  const { order } = await readyForHandover();
  receiptFailure = () => new Response('{}', { status: 500 });
  try { await handOut(order.id); await finishDeferred(); }
  finally { receiptFailure = null; }
  const count = receiptPosts().length;
  const pending = await repo.getPersistedOrder('test-tenant', order.id);
  await fiscal.processFiscalOrder(order.id, Date.parse(pending.fiscal.settlement.firstAttemptAt) + 24 * 3600_000);
  const current = await repo.getPersistedOrder('test-tenant', order.id);
  assert.equal(current.status, 'completed'); assert.equal(current.fiscal.settlement.state, 'needs_review');
  assert.equal(current.fiscal.lastError, 'FISCAL_RECONCILIATION_REQUIRED');
  assert.equal(receiptPosts().length, count);
  assert.equal(current.fiscal.settlement.idempotencyKey, pending.fiscal.settlement.idempotencyKey);
  assert.ok((await repo.getFiscalQueueCounts('test-tenant')).needsReview > 0);
});

test('worker lease survives process loss and the queued receipt is recovered after expiry', async () => {
  const { order } = await readyForHandover();
  await orders.updateServerOrderStatus(order.id, 'completed');
  const current = await repo.getPersistedOrder('test-tenant', order.id);
  const now = Date.now();
  await repo.updatePersistedOrderFiscal(current, { ...current.fiscal, leaseUntil: now + 180_000, nextAttemptAt: now + 180_000 });
  const count = receiptPosts().length;
  assert.equal(await fiscal.processFiscalOrder(order.id, now), 'skipped');
  assert.equal(receiptPosts().length, count);
  assert.ok((await repo.listDueFiscalOrders('test-tenant', now + 180_001)).includes(order.id));
  await fiscal.processFiscalOrder(order.id, now + 180_001);
  assert.equal((await repo.getPersistedOrder('test-tenant', order.id)).fiscal.settlement.state, 'succeeded');
});

test('receipt mismatch/cancellation is retained for review without regenerating receipts', async () => {
  for (const change of [receipt => { receipt.payment_id = randomUUID(); }, receipt => { receipt.items[0].amount.value = '0.01'; }, receipt => { receipt.status = 'canceled'; }]) {
    const { order } = await readyForHandover();
    receiptFailure = async (_url, _options, respond) => { const receipt = await respond().json(); change(receipt); return Response.json(receipt); };
    try { await handOut(order.id); await finishDeferred(); }
    finally { receiptFailure = null; }
    const current = await repo.getPersistedOrder('test-tenant', order.id);
    assert.equal(current.status, 'completed'); assert.equal(current.payment.status, 'succeeded');
    assert.equal(current.fiscal.settlement.state, 'needs_review');
    const count = receiptPosts().length;
    await fiscal.processFiscalOrder(order.id, Date.now() + 86400_000);
    assert.equal(receiptPosts().length, count);
  }
});

test('old paid orders without email/fiscal state remain readable and are not fiscalized on guessed data', async () => {
  const { order } = await readyForHandover();
  const legacy = { ...order, id: randomUUID(), number: `L${Date.now()}`, email: undefined, fiscal: undefined,
    payment: { ...order.payment, receiptVersion: undefined } };
  await repo.createPersistedOrder({ order: legacy, accessToken: 'fixture', idempotencyKey: randomUUID() });
  assert.ok((await orders.listBaristaOrders()).some(item => item.id === legacy.id));
  const count = receiptPosts().length;
  assert.equal((await handOut(legacy.id)).status, 200); await finishDeferred();
  const current = await repo.getPersistedOrder('test-tenant', legacy.id);
  assert.equal(current.status, 'completed'); assert.equal(current.email, undefined);
  assert.equal(current.fiscal.lastError, 'FISCAL_LEGACY_ORDER_REVIEW_REQUIRED');
  assert.equal(receiptPosts().length, count);
});

test('concurrent prepayment registration and handout preserve both fiscal states', async () => {
  const { order } = await readyForHandover();
  const current = await repo.updatePersistedOrderFiscal(order, { ...order.fiscal, prepayment: { status: 'pending' } });
  await Promise.all([repo.recordPrepaymentRegistration(current, 'succeeded'), orders.updateServerOrderStatus(order.id, 'completed')]);
  const issued = await repo.getPersistedOrder('test-tenant', order.id);
  assert.equal(issued.status, 'completed'); assert.equal(issued.fiscal.prepayment.status, 'succeeded');
  assert.equal(issued.fiscal.settlement.state, 'pending');
  await fiscal.processFiscalOrder(order.id);
  assert.equal((await repo.getPersistedOrder('test-tenant', order.id)).fiscal.settlement.state, 'succeeded');
});

test('external fiscal scheduler requires the exact Bearer header and accepts an empty queue', async () => {
  process.env.CRON_SECRET = 'existing_cron_fixture_must_not_authorize_yookassa';
  process.env.YOOKASSA_CRON_SECRET = 'yookassa_cron_fixture_not_real_12345';
  assert.equal((await runFiscalScheduler()).status, 401);
  assert.equal((await runFiscalScheduler('wrong_cron_secret')).status, 401);
  assert.equal((await runFiscalScheduler(process.env.CRON_SECRET)).status, 401);
  assert.equal((await fiscalCron.GET(new Request(`https://test.example/api/cron/yookassa-fiscal?secret=${process.env.YOOKASSA_CRON_SECRET}`))).status, 401);
  const count = calls.length;
  process.env.YOOKASSA_MODE = 'disabled';
  try {
    const response = await runFiscalScheduler(process.env.YOOKASSA_CRON_SECRET);
    assert.equal(response.status, 200); assert.equal((await response.json()).disabled, true);
    assert.equal(calls.length, count);
    process.env.YOOKASSA_MODE = 'test';
    const empty = await runFiscalScheduler(process.env.YOOKASSA_CRON_SECRET);
    const result = await empty.json();
    assert.equal(empty.status, 200); assert.equal(result.disabled, false);
    assert.equal(result.processed, 0); assert.equal(result.retry, 0); assert.equal(result.pending, 0);
  } finally {
    process.env.YOOKASSA_MODE = 'test';
    delete process.env.CRON_SECRET;
    delete process.env.YOOKASSA_CRON_SECRET;
  }
});

test('parallel and repeated external scheduler calls create one settlement receipt', async () => {
  process.env.YOOKASSA_CRON_SECRET = 'yookassa_cron_fixture_not_real_12345';
  const { order } = await readyForHandover();
  await orders.updateServerOrderStatus(order.id, 'completed');
  const count = receiptPosts().length;
  receiptFailure = async (_url, _options, respond) => {
    await new Promise(resolve => setTimeout(resolve, 25));
    return respond();
  };
  try {
    const responses = await Promise.all(Array.from({ length: 4 }, () => runFiscalScheduler(process.env.YOOKASSA_CRON_SECRET)));
    assert.ok(responses.every(response => response.status === 200));
  } finally { receiptFailure = null; }
  assert.equal(receiptPosts().length, count + 1);
  assert.equal((await repo.getPersistedOrder('test-tenant', order.id)).fiscal.settlement.state, 'succeeded');
  const repeat = await runFiscalScheduler(process.env.YOOKASSA_CRON_SECRET);
  assert.equal(repeat.status, 200); assert.equal(receiptPosts().length, count + 1);
  delete process.env.YOOKASSA_CRON_SECRET;
});

test('external scheduler retries a pending receipt with the persisted body and key', async () => {
  process.env.YOOKASSA_CRON_SECRET = 'yookassa_cron_fixture_not_real_12345';
  const { order } = await readyForHandover();
  await orders.updateServerOrderStatus(order.id, 'completed');
  const count = receiptPosts().length;
  receiptFailure = () => new Response('{}', { status: 500 });
  try {
    const failed = await runFiscalScheduler(process.env.YOOKASSA_CRON_SECRET);
    assert.equal(failed.status, 200); assert.equal((await failed.json()).retry, 1);
  } finally { receiptFailure = null; }
  let pending = await repo.getPersistedOrder('test-tenant', order.id);
  assert.equal(pending.fiscal.settlement.state, 'pending');
  await repo.updatePersistedOrderFiscal(pending, { ...pending.fiscal, nextAttemptAt: Date.now() - 1 });
  const retried = await runFiscalScheduler(process.env.YOOKASSA_CRON_SECRET);
  assert.equal(retried.status, 200);
  const attempts = receiptPosts().slice(count);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].options.body, attempts[1].options.body);
  assert.equal(attempts[0].options.headers['Idempotence-Key'], attempts[1].options.headers['Idempotence-Key']);
  pending = await repo.getPersistedOrder('test-tenant', order.id);
  assert.equal(pending.fiscal.settlement.state, 'succeeded');
  delete process.env.YOOKASSA_CRON_SECRET;
});

test('vercel.json keeps only a Hobby-compatible daily cron', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.deepEqual(config.crons, [{ path: '/api/cron/storefront-sync', schedule: '0 20 * * *' }]);
  assert.equal(config.crons.some(job => job.path === '/api/cron/yookassa-fiscal'), false);
});

test('the obsolete fiscal guard is removed only behind explicit mode and valid retry configuration', async () => {
  process.env.YOOKASSA_MODE = 'live'; process.env.YOOKASSA_SECRET_KEY = 'live_fixture_not_a_real_key';
  process.env.YOOKASSA_CRON_SECRET = 'yookassa_cron_fixture_not_real_12345';
  process.env.NEXT_PUBLIC_APP_URL = 'https://test.example';
  try {
    assert.equal(client.assertPaymentCreationEnabled().mode, 'live');
    const { order } = await create();
    const saved = await payments.ensureOrderPayment(order);
    assert.equal(saved.payment.mode, 'live'); assert.ok(saved.payment.id);
    const body = JSON.parse(calls.filter(call => call.options.method === 'POST').at(-1).options.body);
    assert.equal(body.receipt.customer.email, input.email);
    assert.equal(saved.payment.status, 'pending');
  } finally {
    process.env.YOOKASSA_MODE = 'test'; process.env.YOOKASSA_SECRET_KEY = 'test_fixture_not_a_real_key'; delete process.env.YOOKASSA_CRON_SECRET;
  }
});
