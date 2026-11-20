/**
 * Fields known to exist per backend entity, collected from the SAP side of the project (docs/sap-eds: the poster's field pairs,
 * ZCL_MM_MDM_STAGING / REQUEST_SVC). It is only the FALLBACK of lib/mmMap.ts: at run time the real keys of the rows SAP returns and the
 * items of GET /fieldcontrol are added, so a field SAP has but this list lacks still binds. Generated; do not edit by hand.
 */
export const KNOWN_FIELDS: Record<string, string[]> = {
  // Added by hand (not generated): row layout of the classification entity (ClassCharacteristicSet, keys TransId + SrNo)
  ClassCharacteristic: ["SR_NO", "MATNR", "ATBEZ", "ATWRT", "ZAEHL", "ICON", "STATU", "STDCL", "CLASS", "KLTXT", "KLART", "ATNAM"],
  Description: ["MAKTX", "SPRAS"],
  ForecastParameter: ["ALPHA", "ANZPR", "BETA1", "DELTA", "FIMON", "GAMMA", "GEWGR", "KZINI", "KZPAR", "MODAV", "MODAW", "OPGRA", "PERAN", "PERIN", "PERIO", "PRDAT", "PRMOD", "PROPR", "SIGGR"],
  LongText: ["FID", "MATNR", "TEXT"],
  Material: ["AESZN", "BEGRU", "BEHVO", "BISMT", "BLANZ", "BLATT", "BRGEW", "BSTME", "EKWSL", "ERGEI", "ERGEW", "ERVOE", "ETIAR", "ETIFO", "EXTWG", "FERTH", "FORMT", "GEWEI", "GROES", "IHIVI", "ILOOS", "IPRKZ", "KOSCH", "KZEFF", "KZUMW", "LABOR", "MATKL", "MBRSH", "MEINS", "MFRNR", "MFRPN", "MHDHB", "MHDLP", "MHDRZ", "MPROF", "MSTAE", "MSTAV", "MSTDE", "MSTDV", "MTART", "MTPOS_MARA", "NORMT", "NRFHG", "NTGEW", "PRDHA", "PROFL", "QMPUR", "RAUBE", "RBNRM", "RDMHD", "SERLV", "SPART", "STOFF", "TEMPB", "TRAGR", "VOLUM", "WESCH", "WRKST", "XCHPF", "XGCHP", "ZEIAR", "ZEIFO", "ZEINR", "ZEIVR"],
  Plant: ["ABCIN", "AHDIS", "ALTSL", "APLAL", "ATPKZ", "AUFTL", "AUSDT", "AUSME", "AUSSS", "AUTRU", "AWSLS", "BASMG", "BEARZ", "BESKZ", "BSTFE", "BSTMA", "BSTMI", "BSTRF", "CASNR", "CCFIX", "DISGR", "DISLS", "DISMM", "DISPO", "DISPR", "DPLFS", "DPLHO", "DPLPU", "DZEIT", "EISBE", "EISLO", "EKGRP", "EPRIO", "FABKZ", "FEVOR", "FHORI", "FPRFM", "FRTME", "FXHOR", "FXPRU", "GPNUM", "HERKL", "HERKR", "INSMK", "ITARK", "KAUSF", "KAUTB", "KORDB", "KZAUS", "KZBED", "KZDKZ", "KZECH", "KZKFK", "KZKRI", "KZKUP", "KZPSP", "LADGR", "LAGPR", "LFRHY", "LGFSB", "LGPRO", "LGRAD", "LOGGR", "LOSFX", "LOSGR", "LZEIH", "MAABC", "MABST", "MATGR", "MAXLZ", "MDACH", "MEGRU", "MFRGR", "MINBE", "MISKZ", "MMSTA", "MMSTD", "MOGRU", "MOWNR", "MRPPP", "MTVER", "MTVFP", "NCOST", "NFMAT", "OCMPF", "PERIV", "PERKZ", "PLIFZ", "PLNNR", "PLNTY", "PRENC", "PREND", "PRENO", "PRFRQ", "QMATA", "QSSYS", "QZGTP", "RDPRF", "RGEKZ", "RUEZT", "RWPRO", "SAUFT", "SBDKZ", "SCHGT", "SERNP", "SFCPF", "SFEPR", "SHFLG", "SHPRO", "SHZET", "SOBSK", "SOBSL", "SSQSS", "STAWN", "STEUC", "STLAL", "STLAN", "STRGR", "TAKZT", "TRANZ", "UEETK", "UEETO", "UNETO", "USEQU", "VBAMG", "VBEAZ", "VINT1", "VINT2", "VRBDT", "VRBFK", "VRBMT", "VRMOD", "VRVEZ", "VSPVB", "WEBAZ", "WERKS", "WZEIT", "XCHPF", "XMCNG"],
  SalesOrg: ["AUMNG", "BONUS", "DWERK", "KONDM", "KTGRM", "LFMNG", "MEGRU", "MTPOS", "MVGR1", "MVGR2", "MVGR3", "MVGR4", "MVGR5", "PMATN", "PRAT1", "PRAT2", "PRAT3", "PRAT4", "PRAT5", "PRAT6", "PRAT7", "PRAT8", "PRAT9", "PRATA", "PRODH", "PROVG", "RDPRF", "SCMNG", "SKTOF", "VAVME", "VERSG", "VKORG", "VMSTA", "VMSTD", "VRKME", "VTWEG"],
  SalesTaxData: ["ALAND", "TATYP", "TAXKD"],
  StorageLocation: ["BSKRF", "DISKZ", "LBSTF", "LGORT", "LGPBE", "LMINB", "LSOBS", "WERKS"],
  StorageTypeData: ["LGNUM", "LGPLA", "LGTYP", "LPMAX", "LPMIN", "MAMNG", "NSMNG", "RDMNG"],
  TaxClassification: ["ALAND"],
  UnitOfMeasure: ["BREIT", "EAN11", "HOEHE", "LAENG", "MEABM", "MEINH", "MESUB", "NUMTP", "UMREN", "UMREZ", "VOLEH", "VOLUM"],
  Valuation: ["ABWKZ", "BKLAS", "BWPEI", "BWPH1", "BWPRH", "BWPRS", "BWPS1", "BWTTY", "EKALR", "EKLAS", "HKMAT", "HRKFT", "KOSGR", "MYPOL", "PEINH", "QKLAS", "STPRS", "VERPR", "VJBWH", "VJBWS", "VPRSV", "XLIFO", "ZKDAT", "ZPLD1", "ZPLD2", "ZPLD3", "ZPLP1", "ZPLP2", "ZPLP3", "ZPLPR"],
  WarehouseData: ["BLOCK", "BSSKZ", "KZMBF", "KZZUL", "L2SKR", "LETY1", "LETY2", "LETY3", "LGBKZ", "LGNUM", "LHME1", "LHME2", "LHME3", "LHMG1", "LHMG2", "LHMG3", "LTKZA", "LTKZE", "LVSME", "MKAPV", "PLKPT", "VOMEM"],
};
