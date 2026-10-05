/**
 * Port of webapp/model/models.js
 *
 * createDeviceModel() -> see lib/device.ts (useDevice hook).
 * The remaining helpers (formatDate, enrichData, calculateKPI, ...) were not
 * referenced by any view/controller in the UI5 app (left over from the mock
 * data version). They are ported unchanged so nothing is lost.
 */
function pad(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}

const models = {
  formatDate(d: any): string {
    if (!d) return "";
    const dt = d instanceof Date ? d : new Date(d);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return pad(dt.getDate()) + " " + months[dt.getMonth()] + " " + dt.getFullYear();
  },

  formatDateTime(d: any): string {
    if (!d) return "";
    const dt = d instanceof Date ? d : new Date(d);
    return this.formatDate(dt) + ", " + pad(dt.getHours()) + ":" + pad(dt.getMinutes());
  },

  addDays(d: any, days: any): Date {
    const dt = new Date(d);
    dt.setDate(dt.getDate() + Number(days));
    return dt;
  },

  calculateKPI(aLots: any[]) {
    return {
      pending: aLots.filter((l) => l.approvalStatus === "Pending").length,
      approved: aLots.filter((l) => l.approvalStatus === "Approved").length,
      rejected: aLots.filter((l) => l.approvalStatus === "Rejected").length,
      total: aLots.length,
    };
  },

  enrichData(oData: any) {
    oData.lots.forEach((l: any) => {
      const gd = l.grnDate ? new Date(l.grnDate) : null;
      if (gd) {
        l.calculatedSled = this.formatDate(this.addDays(gd, l.totalShelfLife));
        l.actualSled = this.formatDate(this.addDays(gd, l.remainingShelfLife));
        l.grnDateDisp = this.formatDate(gd);
      } else {
        l.calculatedSled = "";
        l.actualSled = "";
        l.grnDateDisp = "";
      }
      if (l.totalShelfLife && l.totalShelfLife > 0) {
        l.remainingPct = Math.round((l.remainingShelfLife / l.totalShelfLife) * 1000) / 10;
      } else {
        l.remainingPct = 0;
      }
      l.approvalDateTimeDisp = l.approvalDateTime ? this.formatDateTime(l.approvalDateTime) : "";
    });
    oData.notifications.forEach((n: any) => {
      n.timestampDisp = this.formatDateTime(n.timestamp);
    });
    oData.kpi = this.calculateKPI(oData.lots);
  },
};

export default models;
