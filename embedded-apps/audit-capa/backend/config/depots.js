/**
 * Depots offered in the Create / Edit Audit "Depot" dropdown, as given by CQA on
 * 2026-10-14 (in CQA's order). The name must match the depot chosen for the depot
 * login in the Emami Apps hub's Manage Access, since audits.depot and users.depot
 * are matched by name (depot users' audit list and notifications).
 *
 * Location and SAP ID are for reference only; the SAP audit flags (A / B) send the
 * depot name itself (e.g. "Ambala Depot") in the Depot field.
 */
const DEPOTS = [
    { name: "Kolkata Depot", location: "Kolkata", sapId: "SUK_COM" },
    { name: "Delhi Depot", location: "Delhi", sapId: "GHA_SUN" },
    { name: "Ambala Depot", location: "Ambala", sapId: "AMB_VIP" },
    { name: "Indore Depot", location: "Indore", sapId: "Ind_eu1" },
    { name: "Jaipur Depot", location: "Jaipur", sapId: "JAI_SUR" },
    { name: "Ahmedabad Depot", location: "Ahmedabad", sapId: "AHM_EU2" },
    { name: "Mumbai Depot", location: "Mumbai", sapId: "MUM_COM" },
    { name: "Pune Depot", location: "Pune", sapId: "PUN_DEP" },
    { name: "Nagpur Depot", location: "Nagpur", sapId: "NAG_Vikas" },
    { name: "Dehradun Depot", location: "Dehradun", sapId: "Deh_eu1, Deh_man" },
    { name: "Kanpur/Unnao Depot", location: "Kanpur", sapId: "KAN_ASH" },
    { name: "Varanasi Depot", location: "Varanasi", sapId: "VNS_EU2" },
    { name: "Patna Depot", location: "Patna", sapId: "PAT_Eu2, Pat_dep" },
    { name: "Bhagalpur Depot", location: "Bhagalpur", sapId: "BHA_EU1" },
    { name: "Ranchi Depot", location: "Ranchi", sapId: "Ran_eu1, Ran_omp" },
    { name: "Raipur Depot", location: "Raipur", sapId: "RAI_EU2" },
    { name: "Cuttack Depot", location: "Cuttack", sapId: "CUT_SUN" },
    { name: "Guwahati Depot", location: "Guwahati", sapId: "Guw_EU1, Guw_EU2, Guw_Tar" },
    { name: "Bangalore Depot", location: "Bangalore", sapId: "BAN_EU1, BAN_EU3, BAN_EU4, BAN_RAJ" },
    { name: "Hyderabad Depot", location: "Hyderabad", sapId: "HYD_COM" },
    { name: "Coimbatore Depot", location: "Coimbatore", sapId: "COI_EU1" },
    { name: "Siliguri Depot", location: "Siliguri", sapId: "SIL_NAG" },
    { name: "Jabalpur Depot", location: "Jabalpur", sapId: "JAB_DEP" },
];

module.exports = { DEPOTS };
