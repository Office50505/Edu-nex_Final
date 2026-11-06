const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'development';
process.env.PAYMENT_GATEWAY_MODE = 'simulated';
process.env.TRIAL_DURATION_HOURS = '24';
process.env.TRIAL_ACCESS_DURATION_HOURS = '26';

const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const User = require('../models/User');
const { completeSimulatedPayment } = require('../controllers/paymentController');

test('simulated success grants the configured trial once and is idempotent', async (t) => {
  const original = {
    orderFindOne: Order.findOne,
    orderFindByIdAndUpdate: Order.findByIdAndUpdate,
    subscriptionFindOneAndUpdate: Subscription.findOneAndUpdate,
    eventFindOne: SubscriptionEvent.findOne,
    eventCreate: SubscriptionEvent.create,
    userFindByIdAndUpdate: User.findByIdAndUpdate,
  };
  t.after(() => {
    Order.findOne = original.orderFindOne;
    Order.findByIdAndUpdate = original.orderFindByIdAndUpdate;
    Subscription.findOneAndUpdate = original.subscriptionFindOneAndUpdate;
    SubscriptionEvent.findOne = original.eventFindOne;
    SubscriptionEvent.create = original.eventCreate;
    User.findByIdAndUpdate = original.userFindByIdAndUpdate;
  });

  const order = {
    _id: 'order-1',
    user: 'user-1',
    totalAmount: 100,
    orderType: 'trial_charge',
    status: 'pending',
    phonePeMerchantTransactionId: 'merchant-1',
    async save() {},
  };
  let subscriptionWrites = 0;
  let trialExpiresAt;
  Order.findOne = async () => order;
  Order.findByIdAndUpdate = async () => {};
  Subscription.findOneAndUpdate = async (_query, update) => {
    subscriptionWrites += 1;
    trialExpiresAt = update.$set.trialExpiresAt;
    return { _id: 'subscription-1' };
  };
  SubscriptionEvent.findOne = async () => null;
  SubscriptionEvent.create = async (value) => value;
  User.findByIdAndUpdate = async () => {};

  const request = {
    body: { merchantTransactionId: 'merchant-1', result: 'success' },
    query: {},
    headers: { accept: 'application/json' },
    is: type => type === 'application/json',
  };
  const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    redirect(location) { this.location = location; return this; },
  });

  const startedAt = Date.now();
  const first = response();
  await completeSimulatedPayment(request, first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.success, true);
  assert.equal(order.status, 'paid');
  assert.equal(subscriptionWrites, 1);
  const grantedHours = (trialExpiresAt.getTime() - startedAt) / 3600000;
  assert.ok(grantedHours >= 25.99 && grantedHours <= 26.01);

  const duplicate = response();
  await completeSimulatedPayment(request, duplicate);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body.alreadyCompleted, true);
  assert.equal(subscriptionWrites, 1);
});
