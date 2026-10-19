// Business vocabulary shared by every module. All codes and labels here are English
// because they feed emails, PDFs, labels and exports (always English).

const STATUSES = ['RECEIVED', 'PREPARING', 'PREPARED', 'READY_FOR_PICKUP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'ON_HOLD', 'CANCELLED'];
const STATUS_LABEL = {
  RECEIVED: 'Received', PREPARING: 'Preparing', PREPARED: 'Prepared', READY_FOR_PICKUP: 'Ready for Pickup',
  SHIPPED: 'Shipped', IN_TRANSIT: 'In Transit', DELIVERED: 'Delivered', ON_HOLD: 'On Hold', CANCELLED: 'Cancelled',
};
const FINAL_STATUSES = ['DELIVERED', 'CANCELLED'];
// Natural forward order; anything else (going backwards, skipping) needs explicit confirmation.
const FLOW = {
  COURIER: ['RECEIVED', 'PREPARING', 'PREPARED', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'],
  PICKUP: ['RECEIVED', 'PREPARING', 'PREPARED', 'READY_FOR_PICKUP', 'DELIVERED'],
  WAREHOUSE: ['RECEIVED', 'PREPARING', 'PREPARED', 'DELIVERED'],
  null: ['RECEIVED', 'PREPARING', 'PREPARED', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'],
};

const DELIVERY_MODES = ['COURIER', 'PICKUP', 'WAREHOUSE'];
const DELIVERY_MODE_LABEL = { COURIER: 'Courier shipment', PICKUP: 'Customer pickup', WAREHOUSE: 'Warehouse delivery' };

const STAGES = {
  PREPARATION: ['MATERIAL_PHOTO', 'SEPARATED_PRODUCTS_PHOTO', 'PREPARATION_PHOTO', 'QUANTITY_CONFIRMATION'],
  PACKAGING: ['PROTECTED_MATERIAL_PHOTO', 'BOX_PHOTO', 'FINAL_PACKAGING_PHOTO'],
  SHIPPING: ['SHIPPING_LABEL_PHOTO', 'CARRIER_DROPOFF_PROOF'],
  PICKUP: ['DELIVERED_MATERIAL_PHOTO', 'COLLECTION_PROOF', 'PICKUP_CONFIRMATION'],
  WAREHOUSE_DELIVERY: ['HANDOVER_PROOF'],
  DELIVERY: ['DELIVERY_PROOF'],
};
const STAGE_LABEL = {
  PREPARATION: 'Sample preparation', PACKAGING: 'Packaging', SHIPPING: 'Shipping',
  PICKUP: 'Customer pickup', WAREHOUSE_DELIVERY: 'Warehouse delivery', DELIVERY: 'Delivery confirmation',
};
const EVIDENCE_LABEL = {
  MATERIAL_PHOTO: 'Material photo', SEPARATED_PRODUCTS_PHOTO: 'Separated products photo',
  PREPARATION_PHOTO: 'Preparation photo', QUANTITY_CONFIRMATION: 'Quantity confirmation',
  PROTECTED_MATERIAL_PHOTO: 'Protected material photo', BOX_PHOTO: 'Box photo', FINAL_PACKAGING_PHOTO: 'Final packaging photo',
  SHIPPING_LABEL_PHOTO: 'Shipping label photo', CARRIER_DROPOFF_PROOF: 'Carrier drop-off proof',
  DELIVERED_MATERIAL_PHOTO: 'Delivered material evidence', COLLECTION_PROOF: 'Collection proof',
  PICKUP_CONFIRMATION: 'Pickup confirmation', HANDOVER_PROOF: 'Warehouse handover proof', DELIVERY_PROOF: 'Delivery proof',
};
const EVIDENCE_STAGE = {};
for (const [stage, types] of Object.entries(STAGES)) for (const t of types) EVIDENCE_STAGE[t] = stage;

// Required documentation per delivery mode. `dueFrom`: first status at which the item
// becomes mandatory (used for the traffic light). `critical` items turn the light red.
const CHECKLISTS = {
  COURIER: [
    { key: 'PREPARATION', label: 'Preparation evidence', stage: 'PREPARATION', dueFrom: 'PREPARED', critical: true },
    { key: 'PACKAGING', label: 'Packaging evidence', stage: 'PACKAGING', dueFrom: 'PREPARED', critical: false },
    { key: 'TRACKING_NUMBER', label: 'Tracking number', data: 'trackingNo', dueFrom: 'SHIPPED', critical: true },
    { key: 'SHIPPING_LABEL', label: 'Shipping label photo', types: ['SHIPPING_LABEL_PHOTO'], dueFrom: 'SHIPPED', critical: true },
    { key: 'DROPOFF', label: 'Carrier drop-off proof', types: ['CARRIER_DROPOFF_PROOF'], dueFrom: 'SHIPPED', critical: true },
    { key: 'DELIVERY', label: 'Delivery confirmation', types: ['DELIVERY_PROOF'], dueFrom: 'DELIVERED', critical: true },
  ],
  PICKUP: [
    { key: 'PREPARATION', label: 'Preparation evidence', stage: 'PREPARATION', dueFrom: 'PREPARED', critical: true },
    { key: 'PACKAGING', label: 'Packaging evidence', stage: 'PACKAGING', dueFrom: 'PREPARED', critical: false },
    { key: 'PICKUP_CONFIRMATION', label: 'Pickup confirmation', types: ['PICKUP_CONFIRMATION', 'DELIVERED_MATERIAL_PHOTO'], dueFrom: 'DELIVERED', critical: true },
    { key: 'COLLECTION_PROOF', label: 'Collection proof', types: ['COLLECTION_PROOF'], dueFrom: 'DELIVERED', critical: true },
  ],
  WAREHOUSE: [
    { key: 'PREPARATION', label: 'Preparation evidence', stage: 'PREPARATION', dueFrom: 'PREPARED', critical: true },
    { key: 'HANDOVER', label: 'Warehouse handover proof', types: ['HANDOVER_PROOF'], dueFrom: 'DELIVERED', critical: true },
    { key: 'DELIVERY', label: 'Delivery confirmation', types: ['DELIVERY_PROOF', 'HANDOVER_PROOF'], dueFrom: 'DELIVERED', critical: true },
  ],
};

// Only carriers whose public tracking page format is documented by the carrier itself.
// Add/verify entries in Settings before using them in customer emails.
const CARRIERS = {
  FEDEX: { name: 'FedEx', trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr={n}' },
  UPS: { name: 'UPS', trackingUrl: 'https://www.ups.com/track?tracknum={n}' },
  DHL: { name: 'DHL Express', trackingUrl: 'https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id={n}' },
  USPS: { name: 'USPS', trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction?tLabels={n}' },
  ESTAFETA: { name: 'Estafeta', trackingUrl: '' },
  PAQUETEXPRESS: { name: 'Paquetexpress', trackingUrl: '' },
  OTHER: { name: 'Other', trackingUrl: '' },
};

const NOTICE_CATEGORIES = ['PUBLIC_HOLIDAY', 'WAREHOUSE_CLOSURE', 'OPERATIONAL_DELAY', 'TEMPORARY_SUSPENSION', 'GENERAL_NOTICE', 'OTHER'];
const NOTICE_LABEL = {
  PUBLIC_HOLIDAY: 'Public Holiday', WAREHOUSE_CLOSURE: 'Warehouse Closure', OPERATIONAL_DELAY: 'Operational Delay',
  TEMPORARY_SUSPENSION: 'Temporary Suspension', GENERAL_NOTICE: 'General Notice', OTHER: 'Other',
};
// Categories that stop the operational clock (non-working days).
const CLOSURE_CATEGORIES = ['PUBLIC_HOLIDAY', 'WAREHOUSE_CLOSURE', 'TEMPORARY_SUSPENSION'];

const AREA_LABEL = { CESANTONI: 'CESANTONI', BODEGA: 'Warehouse', SYSTEM: 'System' };

const DEFAULT_SETTINGS = {
  businessHours: { start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5] },
  holidays: [], // ISO dates (YYYY-MM-DD), configured by CESANTONI
  // Target business hours per stage. Defaults are a starting point; CESANTONI adjusts them.
  targets: {
    RECEIVED_TO_PREPARED: 18,
    PREPARED_TO_SHIPPED: 9,
    SHIPPED_TO_DELIVERED: 45,
    READY_TO_PICKED_UP: 45,
  },
  duplicateWindowDays: 14,
  carriers: CARRIERS,
};

export {
  STATUSES, STATUS_LABEL, FINAL_STATUSES, FLOW, DELIVERY_MODES, DELIVERY_MODE_LABEL,
  STAGES, STAGE_LABEL, EVIDENCE_LABEL, EVIDENCE_STAGE, CHECKLISTS, CARRIERS,
  NOTICE_CATEGORIES, NOTICE_LABEL, CLOSURE_CATEGORIES, AREA_LABEL, DEFAULT_SETTINGS,
};
