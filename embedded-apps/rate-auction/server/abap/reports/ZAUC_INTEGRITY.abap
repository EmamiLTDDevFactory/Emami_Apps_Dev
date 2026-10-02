*&---------------------------------------------------------------------*
*& Report ZAUC_INTEGRITY  (SE38)
*& Audit check, run after an auction or daily:
*&  1. bids above the auction's threshold (should never exist)
*&  2. bids from a vendor who was not invited to that auction
*&---------------------------------------------------------------------*
REPORT zauc_integrity.

DATA: lt_bid  TYPE STANDARD TABLE OF zauc_bid,
      ls_bid  TYPE zauc_bid,
      ls_vend TYPE zauc_vend,
      ls_hdr  TYPE zauc_hdr,
      lv_bad  TYPE i.

START-OF-SELECTION.
  SELECT * FROM zauc_bid INTO TABLE lt_bid.

  LOOP AT lt_bid INTO ls_bid.
    SELECT SINGLE * FROM zauc_hdr INTO ls_hdr WHERE aucid = ls_bid-aucid.
    IF sy-subrc = 0 AND ls_bid-amount > ls_hdr-threshold.
      WRITE: / 'ABOVE THRESHOLD:', ls_bid-aucid, 'bid', ls_bid-bidno, ls_bid-amount, 'limit', ls_hdr-threshold.
      lv_bad = lv_bad + 1.
    ENDIF.
    SELECT SINGLE * FROM zauc_vend INTO ls_vend
      WHERE aucid = ls_bid-aucid AND lifnr = ls_bid-lifnr.
    IF sy-subrc <> 0.
      WRITE: / 'NOT INVITED:', ls_bid-aucid, 'bid', ls_bid-bidno, 'vendor', ls_bid-lifnr.
      lv_bad = lv_bad + 1.
    ENDIF.
  ENDLOOP.

  SKIP.
  IF lv_bad = 0.
    WRITE: / 'No problems found.'.
  ELSE.
    WRITE: / lv_bad, 'problem(s) found.'.
  ENDIF.
