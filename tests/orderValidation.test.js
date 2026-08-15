const mongoose = require('mongoose');
const { validateOrderInput } = require('../src/middleware/validateOrder');
const { rejectGenericStatusUpdate } = require('../src/middleware/restrictStatusUpdate');
const { buildOrderItemsFromCatalog, validatePaymentAmount, isMonnifyStatusConfirmed } = require('../services/orderService');

describe('validateOrderInput', () => {
  it('normalizes common product and price field names', () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const req = {
      user: { id: new mongoose.Types.ObjectId().toString() },
      body: {
        items: [{ id: productId, quantity: 2, price: 735000 }],
        delivery_details: {
          shipping_address: 'Lagos',
          contact_phone: '+2348000000000',
        },
      },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    validateOrderInput(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.items).toEqual([{
      id: productId,
      product_id: productId,
      quantity: 2,
      price: 735000,
      unit_price: 735000,
    }]);
  });

  it('rejects generic status mutations on generic order update routes', () => {
    const req = {
      body: { status: 'paid', otherField: 'value' }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    rejectGenericStatusUpdate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Status updates are forbidden on generic order update routes. Use /orders/:id/status.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('uses the catalog price and validates stock before order creation', () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const catalog = [{
      _id: productId,
      is_active: true,
      unit_price: 1000,
      available_stock: 10,
      unit_of_measure: 'metric_tons'
    }];

    const result = buildOrderItemsFromCatalog([
      { product_id: productId, quantity: 3, unit_price: 1 },
    ], catalog);

    expect(result.totalAmount).toBe(3000);
    expect(result.items[0].unit_price).toBe(1000);
    expect(result.items[0].quantity).toBe(3);
  });

  it('rejects payment amounts that do not match the server-side order total', () => {
    expect(() => validatePaymentAmount(2500, { total_amount: 3000 })).toThrow('Payment amount does not match order total');
    expect(() => validatePaymentAmount(3000, { total_amount: 3000 })).not.toThrow();
  });

  it('accepts provider confirmations only when amount and currency match the order', () => {
    expect(isMonnifyStatusConfirmed('PAID', 3000, 3000, 'NGN')).toBe(true);
    expect(isMonnifyStatusConfirmed('PAID', 2500, 3000, 'NGN')).toBe(false);
    expect(isMonnifyStatusConfirmed('PAID', 3000, 3000, 'USD')).toBe(false);
  });

  it('enforces admin-only dispute resolution and buyer/supplier state boundaries', () => {
    const { canRoleTransition } = require('../src/models/Order');

    expect(canRoleTransition('buyer', 'in-transit', 'delivered')).toBe(true);
    expect(canRoleTransition('buyer', 'delivered', 'funds_released')).toBe(true);
    expect(canRoleTransition('supplier', 'in-transit', 'delivered')).toBe(false);
    expect(canRoleTransition('supplier', 'paid', 'processing')).toBe(true);
    expect(canRoleTransition('seller', 'disputed', 'resolved')).toBe(false);
    expect(canRoleTransition('admin', 'disputed', 'resolved')).toBe(true);
  });
});