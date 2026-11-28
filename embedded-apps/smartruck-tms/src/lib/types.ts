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
export interface Loc { id: string; city: string; state: string; zone: string; lat: number; lon: number; pincode: string; /** SAP route point (TVRAB) */ sapPoint?: string; source?: 'sap' }
export interface Carrier {
  id: string; name: string; code: string; type: string; shortName: string; paymentTerms: string;
  weightage: number; blocked: boolean; rating: number; fleet: number; lanes: string[]; rejectionPct: number; fulfilledPct: number;
  /** Transporter e-mail(s) for indent mails (one address or several separated by , or ;). Missing = the mail shows 'No e-mail'. */
  email?: string;
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
  ewayExpiry: string; ewayNo?: string;
  /** Outward tracking (live): trip fields */
  /** Billing documents on the vehicle (replaces Instavans / ZSMART_VEH); instavans = the Instavans vehicle holding it during the parallel run. */
  invoices?: TripInvoice[]; invoicePlant?: string; sapVehicle?: { ok: boolean; at: string; message: string; target?: string; simulated?: boolean };
  indentId?: string; freightRate?: { rate: number; per: string; currency: string }; shippingType?: string; deliveries?: Delivery[]; eccShipmentNo?: string; eccCost?: { net: number; tax: number; currency: string; status: string; at: string; source: string };
  loading?: Loading; sealNo?: string; departedAt?: string; arrivedAt?: string; plannedArrival?: string; etaAt?: string; delayFlag?: boolean; events?: TrackEvent[];
  receipt?: Receipt; pod?: { fileId: string; name: string; at: string; by: string }; driverConsent?: { at: string; by: string; version: string }; ulipCheck?: { ok: boolean; simulated: boolean; at: string };
  trackToken?: string; departPhoto?: string; pos?: { lat: number; lon: number; at: string; speed: number; source: string }; material: string; qty: number; customerId: string; log: Activity[]; gpsReason?: string; delayReason?: string;
}
export interface TripInvoice { no: string; plant: string; date: string; customer: string; cases: number; value: number; currency: string; grossKg: number; netKg: number; instavans?: { sin: string; vehicle: string } }
export interface Delivery { no: string; plant?: string; shipTo: string; cartons: number; weightKg: number; volumeM3: number; source: 'sap' | 'manual'; irn?: string; ewbNo?: string; ewbValid?: string }
export interface Loading { weightKg: number; volumeM3: number; weightPct: number; volumePct: number; effectivePct: number; minPct: number; reason: string; approval: 'NotNeeded' | 'Pending' | 'Approved' | 'Rejected'; approvedBy?: string; at: string; by: string }
export interface TrackEvent { at: string; source: 'ULIP' | 'Manual' | 'System'; place: string; lat: number; lon: number; note?: string; by?: string }
export interface Receipt { arrivedAt: string; dispatched: number; cartonsReceived: number; damagedQty: number; shortage: number; unloadingCharge: number; detentionCharge: number; remarks: string; chargesApproval: 'NotNeeded' | 'Pending' | 'Approved' | 'Rejected'; by: string; approvedBy?: string }
export interface VehicleType { code: string; name: string; maxWeightKg: number; maxVolumeM3: number; /** internal cargo size in cm (for the Loading Optimizer) */ lengthCm?: number; widthCm?: number; heightCm?: number; source?: 'sap' }
/** One transporter rate on a lane. SAP rows come from freight condition ZB00 (source 'sap'): mode = shippingType (VSART) + sapVehicle (ADD01);
 *  vehicleType is set only when ADD01 is a truck code, otherwise the rate applies to every vehicle. per = rate unit (KG = per kg gross weight). */
export interface LaneVendor {
  carrierId: string; priority: number; rate: number; currency?: string; per?: string; perQty?: number; vehicleType?: string; shippingType?: string;
  sapVehicle?: string; rateBasis?: string; sdabw?: string; shtyp?: string; route?: string; condTable?: string; condRecord?: string; source?: 'sap';
}
export interface Lane { id: string; fromLocId: string; toLocId: string; distanceKm: number; transitH: number; vendors: LaneVendor[]; sapRoutes?: string[]; syncedAt?: string }
export interface Offer { carrierId: string; offeredAt: string; expiresAt: string; response: 'Pending' | 'Accepted' | 'Rejected' | 'Timed out' | 'Withdrawn'; reason?: string; respondedAt?: string; rate: number; per?: string; currency?: string }
/** One driver / vehicle of an indent item (the vendor fills these three fields; `vehicles` rows per item). */
export interface IndentUnit { driver: string; phone: string; vehicleNo: string }
export type IndentItemStatus = 'Pending' | 'Submitted' | 'Rejected' | 'Expired' | 'Cancelled';
/** A transporter line of an indent: same indent number, item numbers 10, 20, 30 ... (shown IND123-10). docs/PHASE1_TRIP_TRAIL_DOC.md */
export interface IndentItem {
  itemNo: number; carrierId: string; cases: number; vehicles: number; qty: number; requiredAt: string; rate: number; per?: string; currency?: string;
  status: IndentItemStatus; expiresAt: string; units: IndentUnit[]; submittedAt?: string; rejectReason?: string; orderId?: string; sins?: string[];
  mail?: { to?: string; sent: boolean; simulated?: boolean; error?: string; at?: string };
  /** Set on a Rejected / Expired line HO has re-offered: the item number of the new line. The old line stops counting. */
  replacedBy?: number;
}
export interface Indent {
  id: string; unitId: string; laneId: string; fromLocId: string; toLocId: string; customerId: string; vehicleType: string; shippingType?: string; vehicles: number; requiredAt: string; deliveries: string[];
  material: string; qty: number; status: 'Draft' | 'Open' | 'Allocated' | 'Partly allocated' | 'Vehicle Assigned' | 'Cancelled'; offers: Offer[]; escalated?: boolean; orderId?: string; sin?: string; createdAt: string; createdBy: string; remarks: string[];
  /** Phase 1: total cases and the transporter items. Absent on legacy single-transporter indents. */
  cases?: number; items?: IndentItem[];
}
export interface TmsSettings { offerTimeoutH: number; capacityMinPct: number; invoiceTolerancePct: number; delayMarginH: number; unlinkedAlertH: number; invoiceMailbox: string; consentVersion: string; consentText: string }
export interface Invoice {
  id: string; sin: string; carrierId: string; unitId: string; status: InvStatus; amount: number; sapDoc?: string; miro: string;
  date: string; vehicleNo: string; history: Activity[]; simulated?: boolean;
  invoiceNo?: string; lrNo?: string; expected?: number; basis?: string; extras?: number; variancePct?: number; review?: 'OK' | 'Under Review' | 'Cleared' | 'Rejected'; fileId?: string; mailedAt?: string;
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
  vehicleTypes?: VehicleType[]; lanes?: Lane[]; indents?: Indent[]; settings?: Partial<TmsSettings>;
  /** Texts of SAP codes on lane rates: vehicle / rate method (ADD01) and shipping type (VSART). */
  sapTexts?: { vehicles: Record<string, string>; shipping: Record<string, string> };
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
  'Carrier Vendor': { label: 'Carrier Vendor', perms: [{ key: 'bid.place', label: 'Place bids (own carrier)' }, { key: 'indent.respond', label: 'Accept / reject indents' }, { key: 'ship.assign.own', label: 'Assign vehicle, depart, POD, invoice (own trips)' }] },
  'Depot User': { label: 'Depot User', perms: [{ key: 'indent.create', label: 'Raise indents' }, { key: 'indent.cancel', label: 'Cancel indents' }, { key: 'trip.manage', label: 'Link deliveries, loading check, receipt, POD' }] },
  'Depot Head': { label: 'Depot Head', perms: [{ key: 'trip.manage', label: 'Trip work' }, { key: 'loading.approve', label: 'Approve under-loaded vehicles' }, { key: 'charges.approve', label: 'Approve unloading / detention' }, { key: 'indent.create', label: 'Raise indents' }] },
  'HO Logistics': { label: 'HO Logistics', perms: [{ key: 'lane.manage', label: 'Lanes, vehicle types, SAP lane sync' }, { key: 'indent.override', label: 'Override capacity / offer to a vendor' }, { key: 'invoice.review', label: 'Review out-of-tolerance invoices' }, { key: 'settings.manage', label: 'Thresholds and mailbox' }, { key: 'trip.manage', label: 'Trip work' }] },
  'Distribution Planner': { label: 'Distribution Planner', perms: [{ key: 'plan.view', label: 'View Distribution Planning' }, { key: 'plan.run', label: 'Refresh from SAP, upload forecast' }] },
  'Admin': { label: 'Admin', perms: [{ key: 'user.manage', label: 'Manage Users' }, { key: '*', label: 'All permissions' }] },
};
