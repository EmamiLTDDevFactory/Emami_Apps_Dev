// Audit & CAPA roles, set in the hub's Manage Access: CQA, Depot and View.
// View = Depot-side, read-only: sees what a Depot user of the same depot sees
// (depot "HO" sees every depot) but can't fill, sign or submit anything.
export const VIEW_ROLE = "View";
export const HO_DEPOT = "HO";

export const isViewOnlyUser = (user) => user?.role === VIEW_ROLE;

// Depot or View: everything CQA-only stays hidden for these users.
export const isDepotSideUser = (user) =>
    user?.role === "Depot" || isViewOnlyUser(user);

// View users at Head Office see every depot's audits.
export const seesAllDepots = (user) =>
    isViewOnlyUser(user) && user?.depot === HO_DEPOT;
