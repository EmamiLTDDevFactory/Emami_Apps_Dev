export type Basis = 'Vehicle' | 'Weight' | 'Pallet';
export type OrderStatus = 'Open' | 'Active' | 'Fulfilled' | 'Cancelled';
export type ShipStatus =
  | 'Requested' | 'Accepted' | 'Assigned' | 'Towards Pickup' | 'At Pickup'
  | 'In Transit' | 'At Delivery' | 'Completed' | 'Cancelled' | 'Rejected';
export type Tracking = 'Active' | 'Passive' | 'Non-Tracking' | 'No GPS';
export type Consent = 'Granted' | 'Pending' | 'Expired' | 'Declined';
export type EPod = 'Pending' | 'Uploaded' | 'Verified';
export type InvStatus = 'Pending (Logistics)' | 'Pending (Finance)' | 'Approved' | 'Disapproved' | 'Billed' | 'Ready For Payment' | 'Paid';
export type ShipType = 'Primary' | 'Secondary' | 'LTL';

export interface Unit { id: string; code: string; name: string; division: string; city: string }
export interface Loc { id: string; city: string; state: string; zone: string; lat: number; lon: number; pincode: string }
export interface Carrier {
  id: string; name: string; code: string; type: string; shortName: string; paymentTerms: string;
  weightage: number; blocked: boolean; rating: number; fleet: number; lanes: string[]; rejectionPct: number; fulfilledPct: number;
}
export interface Customer { id: string; name: string; rCode: string; zone: string; contact: string; csl: string; segment: string }
export interface Stop { type: 'P' | 'D'; locId: string; at: string; actual?: string }
export interface BidEntry { carrierId: string; price: number; at: string }
export interface Bid {
  startPrice: number; expiresAt: string; diffType: 'Percentage' | 'Amount'; diffValue: number; paymentTerms: string;
  vendors: string[]; bids: BidEntry[]; status: 'Open' | 'Awarded' | 'Expired'; winner?: string; awardedPrice?: number;
  /** Live mode, carrier users only: current lowest price (they see their own bids and this, never other vendors). */
  lowest?: number;
}
export interface Order {
  id: string; oin: string; unitId: string; customerId: string; mode: 'FTL' | 'BID'; basis: Basis; vehicleType: string; vehicles: number;
  stops: Stop[]; material: string; qty: number; uom: string; packages: number; po: string; so: string; project: string;
  segment: string; odc: boolean; tolerance: number; comments: string; status: OrderStatus; createdAt: string; createdBy: string;
  bid?: Bid; remarks: string[];
}
export interface Activity { at: string; actor: string; text: string }
export interface Shipment {
  sin: string; orderId: string; unitId: string; type: ShipType; direction: 'Outbound' | 'Inbound' | 'Others'; status: ShipStatus;
  carrierId: string; vehicleNo: string; vehicleType: string; driver: string; phone: string; provider: 'Jio' | 'Airtel' | 'Vi';
  consent: Consent; consentSince?: string; tracking: Tracking; ePod: EPod; freight: number; fromLocId: string; toLocId: string;
  pickupAt: string; progress: number; delayH: number; anomaly?: 'Tracking' | 'Speed' | 'Distance'; lr: string; km: number;
  ewayExpiry: string; ewayNo?: string; pos?: { lat: number; lon: number; at: string; speed: number; source: string }; material: string; qty: number; customerId: string; log: Activity[]; gpsReason?: string; delayReason?: string;
}
export interface Invoice {
  id: string; sin: string; carrierId: string; unitId: string; status: InvStatus; amount: number; sapDoc?: string; miro: string;
  date: string; vehicleNo: string; history: Activity[]; simulated?: boolean;
}
export interface Voucher { id: string; carrierId: string; amount: number; status: 'Draft' | 'Posted'; date: string; invoices: string[] }
export interface Note { id: string; kind: 'Debit' | 'Credit'; carrierId: string; amount: number; reason: string; date: string; sin: string }
export interface AppUser { id: string; name: string; email: string; designation: string; units: string[]; roles: string[]; lastSignin: string; carrierId?: string }
export interface Notification { id: string; at: string; level: 'info' | 'warn' | 'crit'; text: string; read: boolean }
export interface Geofence { id: string; name: string; type: 'Pickup' | 'Delivery' | 'Warehouse'; locId: string; radiusM: number; completions: number }

export interface Db {
  units: Unit[]; locs: Loc[]; carriers: Carrier[]; customers: Customer[]; orders: Order[]; shipments: Shipment[];
  invoices: Invoice[]; vouchers: Voucher[]; notes: Note[]; users: AppUser[]; notifications: Notification[]; geofences: Geofence[];
  seq: number;
}

export const ROLE_PERMS: Record<string, { label: string; perms: { key: string; label: string }[] }> = {
  'Allocation Executive': { label: 'Allocation Executive', perms: [
    { key: 'order.create', label: 'Post Order' }, { key: 'order.allocate', label: 'Allocate Order' },
    { key: 'order.cancel', label: 'Cancel / Delete Order' }, { key: 'bid.award', label: 'Award Bid' } ] },
  'Carrier Administrator': { label: 'Carrier Administrator', perms: [
    { key: 'carrier.add', label: 'Add Carrier Lanes' }, { key: 'carrier.block', label: 'Block Carrier' },
    { key: 'carrier.delete', label: 'Delete Carrier Lanes' }, { key: 'carrier.weightage', label: 'Edit Carrier Weightage' } ] },
  'Finance Executive': { label: 'Finance Executive', perms: [
    { key: 'inv.approve.l', label: 'Approve Invoice (Logistics)' }, { key: 'voucher.create', label: 'Create Payment Voucher' } ] },
  'Finance Administrator': { label: 'Finance Administrator', perms: [
    { key: 'inv.approve.f', label: 'Approve Invoice (Finance)' }, { key: 'inv.pay', label: 'Release Payment' }, { key: 'note.create', label: 'Raise Debit / Credit Note' } ] },
  'Marketing': { label: 'Marketing', perms: [{ key: 'customer.edit', label: 'Edit Customers' }, { key: 'report.view', label: 'View Reports' }] },
  'Control Tower': { label: 'Control Tower', perms: [
    { key: 'ship.update', label: 'Update Shipment / Delay Reasons' }, { key: 'sim.manage', label: 'Manage SIM Consent' }, { key: 'report.view', label: 'View Reports' } ] },
  'Carrier Vendor': { label: 'Carrier Vendor', perms: [{ key: 'bid.place', label: 'Place bids (own carrier)' }] },
  'Admin': { label: 'Admin', perms: [{ key: 'user.manage', label: 'Manage Users' }, { key: '*', label: 'All permissions' }] },
};
