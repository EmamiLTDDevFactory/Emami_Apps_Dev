import { Invoice } from '@/types/models';
import { edDeliveryDelay } from './delay';

export const parseFloatSafe = (val: any): number => {
    if (!val) return 0;
    const p = parseFloat(val);
    return isNaN(p) ? 0 : p;
};

export const parseIntSafe = (val: any): number => {
    if (val === null || val === undefined || val === '') return 0;
    const p = parseInt(val, 10);
    return isNaN(p) ? 0 : p;
};

export const parseDate = (val: any): string | null => {
    if (!val) return null;
    const match = val.match(/\/Date\((\d+)\)\//);
    if (match) return new Date(parseInt(match[1], 10)).toISOString().split('T')[0];
    return val;
};

export function normalizeInvoice(raw: any): Invoice {
    const edd = parseDate(raw.Edd) || '';
    const actualDeliveryDate = parseDate(raw.ActDelDate || raw.DelDate);
    // SAP's TotalDelay has been observed as 0 for invoices that are clearly
    // late by EDD vs ActDelDate — recompute from the dates whenever both are
    // known, and only fall back to SAP's own value for rows without an
    // actual delivery date yet (e.g. pending/dispatched).
    const computedDelay = edDeliveryDelay(edd, actualDeliveryDate);
    return {
        invoice_no: raw.Vbeln || '',
        invoice_date: parseDate(raw.Fkdat) || '',
        depot: raw.Werks || '',
        depot_name: raw.DepotName || '',
        zone: raw.Regio || '',
        channel: raw.Vtweg || '',
        division: raw.Spart || '',
        customer_id: raw.Kunnr || '',
        customer_name: raw.Name1 || '',
        town: raw.Ort01 || '',
        route_code: raw.Route || '',
        order_receiving_date: parseDate(raw.OrdErdat) || '',
        payment_receiving_date: parseDate(raw.PayErdat) || '',
        no_of_cases: parseFloatSafe(raw.Fkimg),
        invoice_value: parseFloatSafe(raw.Netwr),
        gross_weight_kg: parseFloatSafe(raw.GrossWt),
        distance_km: parseFloatSafe(raw.Distz),
        edd,
        transporter: (raw.Transporter || raw.Tdname || raw.CarrName || raw.Lifex || raw.ForwardAgent || '').trim(),
        lr_no: raw.LrNo || '',
        vehicle_type: raw.VehicleType || '',
        vehicle_no: raw.VehicleNo || '',
        dispatch_date: parseDate(raw.DispatchDate || raw.Disptdat || raw.Dispdat || raw.Wadat_ist),
        // ActDelDate is what postComplete writes and what InvoiceCompSet/InvoiceRetSet return.
        // It was missing here, so the Completed card's "Delivered" field, the delivery-date sort,
        // the EDD colour comparison and the "Actual Delivery Date" export column were all reading
        // an undefined property. DelDate is kept as a fallback for any row that uses it instead.
        actual_delivery_date: actualDeliveryDate,
        // RecDate is written by postReturn and returned by InvoiceRetSet — the Returned card's
        // "Receiving Date" was reading an undefined property.
        receiving_date: parseDate(raw.RecDate),
        // CanDate is written by postCancel and returned by InvoiceCanSet — the Cancelled card's
        // "Cancel Date" was blank, and its sort silently fell back to invoice_date.
        cancel_date: parseDate(raw.CanDate),
        cancel_reason: raw.CanRsn || raw.CancelReason || '',
        agreed_tat: parseIntSafe(raw.Tat || raw.AgreedTat),
        delay_dispatch: parseIntSafe(raw.DelayDispatch),
        delay_delivery: parseIntSafe(raw.DelayDelivery),
        total_delay: computedDelay ?? parseIntSafe(raw.TotalDelay),
        status: raw.Status || 'Pending',
        source: raw.Source || 'sap_live'
    } as any;
}
