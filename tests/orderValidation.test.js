const mongoose = require('mongoose');
const { validateOrderInput } = require('../src/middleware/validateOrder');

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
});