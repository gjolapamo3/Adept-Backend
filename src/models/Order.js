const mongoose = require('mongoose');

const ORDER_STATUSES = ['pending', 'paid', 'processing', 'in-transit', 'delivered', 'funds_released', 'disputed', 'resolved', 'cancelled'];

// Finite state machine: maps each status to the set of statuses it may move to next.
const ALLOWED_TRANSITIONS = {
  pending: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled', 'disputed'],
  processing: ['in-transit', 'cancelled', 'disputed'],
  'in-transit': ['delivered', 'disputed'],
  delivered: ['funds_released', 'disputed'],
  funds_released: [],
  disputed: ['resolved', 'cancelled'],
  resolved: [],
  cancelled: []
};

const isValidTransition = (fromStatus, toStatus) => {
  if (fromStatus === toStatus) return true;
  return Boolean(ALLOWED_TRANSITIONS[fromStatus]?.includes(toStatus));
};

// Restricts which roles may perform which transitions, on top of the base FSM above.
// pending -> paid is system/webhook/admin only (not reachable by buyer/supplier here).
// disputed -> resolved/cancelled is admin only.
const ROLE_ALLOWED_TRANSITIONS = {
  buyer: {
    pending: ['cancelled'],
    paid: ['disputed'],
    processing: ['disputed'],
    'in-transit': ['delivered', 'disputed'],
    delivered: ['funds_released', 'disputed']
  },
  supplier: {
    paid: ['processing', 'disputed'],
    processing: ['in-transit', 'disputed'],
    'in-transit': ['disputed'],
    delivered: ['disputed']
  }
};

const canRoleTransition = (role, fromStatus, toStatus) => {
  if (!isValidTransition(fromStatus, toStatus)) return false;
  if (role === 'admin') return true;
  return Boolean(ROLE_ALLOWED_TRANSITIONS[role]?.[fromStatus]?.includes(toStatus));
};

const orderItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  unit_price: { type: Number, required: true },
  unit_of_measure: { type: String, default: 'metric_tons' }
});

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  changed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  changed_at: { type: Date, default: Date.now }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  order_reference: { type: String, required: true, unique: true },
  idempotency_key: { type: String, index: true, sparse: true, unique: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [orderItemSchema],
  total_amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ORDER_STATUSES, 
    default: 'pending' 
  },
  status_history: { type: [statusHistorySchema], default: [] },
  delivery_details: {
    shipping_address: { type: String, required: true },
    contact_phone: { type: String, required: true },
    delivery_notes: String
  },
  payment_reference: { type: String },
  payment_method: { type: String, default: 'bank_transfer' }
}, { timestamps: true });

// Track the status a document was loaded with so we can validate transitions on save.
orderSchema.post('init', function (doc) {
  doc.$locals.originalStatus = doc.status;
});

orderSchema.pre('save', function () {
  if (this.isNew) {
    this.status_history.push({ status: this.status, changed_by: this.$locals.statusChangedBy || this.buyer });
    return;
  }

  if (this.isModified('status')) {
    const fromStatus = this.$locals.originalStatus;
    const toStatus = this.status;

    if (!isValidTransition(fromStatus, toStatus)) {
      throw new Error(`Invalid order status transition: '${fromStatus}' -> '${toStatus}'`);
    }

    this.status_history.push({ status: toStatus, changed_by: this.$locals.statusChangedBy });
  }
});

orderSchema.methods.canTransitionTo = function (toStatus) {
  return isValidTransition(this.status, toStatus);
};

orderSchema.statics.ORDER_STATUSES = ORDER_STATUSES;
orderSchema.statics.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;
orderSchema.statics.ROLE_ALLOWED_TRANSITIONS = ROLE_ALLOWED_TRANSITIONS;
orderSchema.statics.isValidTransition = isValidTransition;
orderSchema.statics.canRoleTransition = canRoleTransition;

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
