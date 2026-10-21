// Mock data: every response comes from these arrays, and changes are made to them in memory. There's no database,
// so restarting npm run dev (or AWS starting a fresh Lambda) puts everything back to what's written here.

export interface Product {
  sku: string;
  name: string;
  price: number;
  onHand: number;
  reorderPoint: number;
  reorderQty: number;
  supplier: string;
}

export interface Order {
  id: string;
  externalId: string | null;
  status: string;
  customer: { name: string; email: string };
  items: { sku: string; name: string; qty: number; unitPrice: number }[];
  total: number;
  shipping: { carrier: string | null; trackingNumber: string | null };
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  sku: string;
  productName: string;
  qty: number;
  supplier: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Hook {
  id: string;
  targetUrl: string;
  events: string[];
}

const at = '2026-10-20T15:00:00.000Z';

const initial = () => ({
  storeName: process.env.STORE_NAME || 'Trailhead Supply Co.',

  products: [
    { sku: 'WB-750', name: 'Insulated Water Bottle 750 ml', price: 24.99, onHand: 40, reorderPoint: 10, reorderQty: 50, supplier: 'Summit Drinkware' },
    { sku: 'HL-300', name: 'Rechargeable Headlamp 300 lm', price: 39.0, onHand: 14, reorderPoint: 5, reorderQty: 20, supplier: 'Lumen Outdoor' },
    { sku: 'SK-MER-M', name: 'Merino Hiking Socks (M)', price: 18.5, onHand: 60, reorderPoint: 20, reorderQty: 80, supplier: 'Ridge Textiles' },
    { sku: 'RJ-M', name: 'Packable Rain Shell (M)', price: 129.0, onHand: 4, reorderPoint: 3, reorderQty: 10, supplier: 'Ridge Textiles' },
    { sku: 'TM-12', name: 'Trail Mix 12-Pack', price: 21.0, onHand: 8, reorderPoint: 10, reorderQty: 40, supplier: 'Basecamp Foods' },
    { sku: 'MUG-ENM', name: 'Enamel Camp Mug', price: 14.0, onHand: 4, reorderPoint: 5, reorderQty: 30, supplier: 'Summit Drinkware' },
  ] as Product[],

  orders: [
    {
      id: 'ord_1001', externalId: 'shop-1001', status: 'paid',
      customer: { name: 'Jordan Rivers', email: 'jordan@example.com' },
      items: [
        { 
          sku: 'WB-750', 
          name: 'Insulated Water Bottle 750 ml', 
          qty: 41, 
          unitPrice: 24.99 
        }, 
        { 
          sku: 'MUG-ENM', 
          name: 'Enamel Camp Mug', 
          qty: 3, 
          unitPrice: 14.99 
        }
      ],
      total: 49.98, shipping: { carrier: null, trackingNumber: null }, note: null, createdAt: at, updatedAt: at,
    },
    {
      id: 'ord_1002', externalId: null, status: 'shipped',
      customer: { name: 'Lee Park', email: 'lee@example.com' },
      items: [{ sku: 'HL-300', name: 'Rechargeable Headlamp 300 lm', qty: 1, unitPrice: 39.0 }],
      total: 39.0, shipping: { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' }, note: 'Gift wrap', createdAt: at, updatedAt: at,
    },
  ] as Order[],

  purchaseOrders: [
    { id: 'po_1001', sku: 'MUG-ENM', productName: 'Enamel Camp Mug', qty: 30, supplier: 'Summit Drinkware', status: 'ordered', createdAt: at, updatedAt: at },
  ] as PurchaseOrder[],

  // Webhooks Make's custom app registers ("Watch events"); see POST /api/hooks
  hooks: [] as Hook[],

  // Last number used per ID prefix: the next order is ord_1003
  counters: { ord: 1002, po: 1001, hk: 1000, evt: 1000 } as Record<string, number>,
});

export const db = initial();

/** Back to the data above (tests call this before each test). */
export function resetMockData(): void {
  Object.assign(db, initial());
}

export function nextId(prefix: string): string {
  db.counters[prefix] += 1;
  return `${prefix}_${db.counters[prefix]}`;
}
