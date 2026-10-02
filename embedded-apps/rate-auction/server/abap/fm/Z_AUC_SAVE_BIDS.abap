*&---------------------------------------------------------------------*
*& Function module Z_AUC_SAVE_BIDS
*& Attributes: Remote-Enabled Module
*& Tables:  IT_BIDS LIKE ZAUC_S_BID
*& Exceptions: AUCTION_NOT_FOUND
*& The platform never sends a bid above the threshold. This module checks again and, if one ever
*& arrives, SAVES it with OVER_CAP = X so it is visible in the audit report instead of blocking
*& the live auction. The auction header must already be saved (the platform always saves it first).
*&---------------------------------------------------------------------*
  DATA: ls_bid   TYPE zauc_bid,
        lt_bid   TYPE STANDARD TABLE OF zauc_bid,
        lv_aucid TYPE zauc_hdr-aucid,
        lv_thr   TYPE zauc_hdr-threshold.

  LOOP AT it_bids.
    IF it_bids-aucid <> lv_aucid.
      lv_aucid = it_bids-aucid.
      SELECT SINGLE threshold FROM zauc_hdr INTO lv_thr WHERE aucid = lv_aucid.
      IF sy-subrc <> 0.
        RAISE auction_not_found.
      ENDIF.
    ENDIF.
    MOVE-CORRESPONDING it_bids TO ls_bid.
    ls_bid-mandt = sy-mandt.
    IF ls_bid-amount > lv_thr.
      ls_bid-over_cap = 'X'.           " should never happen: flag it for audit
    ELSE.
      CLEAR ls_bid-over_cap.
    ENDIF.
    APPEND ls_bid TO lt_bid.
  ENDLOOP.

  IF lt_bid IS NOT INITIAL.
    MODIFY zauc_bid FROM TABLE lt_bid.
    COMMIT WORK.
  ENDIF.
