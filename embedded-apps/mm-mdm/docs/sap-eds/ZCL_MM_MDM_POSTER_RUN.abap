CLASS zcl_mm_mdm_poster_run DEFINITION PUBLIC FINAL CREATE PUBLIC.
  "! Temporary console runner for the poster (ADT F9). Remove once the poster has passed its tests.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PRIVATE SECTION.
    CONSTANTS c_tid TYPE /inowits/transid VALUE '0099999991'.
    METHODS clean_up.
    METHODS stage IMPORTING iv_matkl TYPE matkl.
    METHODS drop IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid.
    METHODS diff IMPORTING is_a TYPE any is_b TYPE any iv_name TYPE string RETURNING VALUE(rv_text) TYPE string.
ENDCLASS.

CLASS zcl_mm_mdm_poster_run IMPLEMENTATION.
  METHOD clean_up.
    DELETE FROM /inowits/mm_mara WHERE transid = @c_tid.
    DELETE FROM /inowits/mm_makt WHERE transid = @c_tid.
    DELETE FROM /inowits/m_vwsel WHERE transid = @c_tid.
    DELETE FROM /inowits/mm_exse WHERE transid = @c_tid.
    DELETE FROM /inowits/mm_text WHERE transid = @c_tid.
    DELETE FROM /inowits/cm_meta WHERE transid = @c_tid.
    DELETE FROM /inowits/ph_d_m WHERE value = @c_tid.
    DELETE FROM /inowits/m_trans WHERE transid = @c_tid.
    COMMIT WORK.
  ENDMETHOD.

  METHOD stage.
    clean_up( ).
    INSERT /inowits/mm_mara FROM @( VALUE #( transid = c_tid mtart = 'ROH' mbrsh = 'F' meins = 'PC' matkl = iv_matkl spart = '01'
                                              mtpos_mara = 'NORM' maktx = 'ZZ UNIT TEST DELETE ME' ) ).
    INSERT /inowits/mm_makt FROM @( VALUE #( transid = c_tid spras = 'E' maktx = 'ZZ UNIT TEST DELETE ME' ) ).
    INSERT /inowits/m_vwsel FROM @( VALUE #( transid = c_tid mara_basic1 = 'X' ) ).
    INSERT /inowits/m_trans FROM @( VALUE #( transid = c_tid app_id = 'MC' ) ).
    COMMIT WORK.
  ENDMETHOD.

  METHOD drop.
    DATA(lv_b) = zcl_mm_mdm_change=>base_id( iv_transid ).
    LOOP AT zcl_mm_mdm_naming=>delete_tables( ) INTO DATA(lv_tab).
      DELETE FROM (lv_tab) WHERE transid = iv_transid OR transid = lv_b.
    ENDLOOP.
    DELETE FROM /inowits/m_trans WHERE transid = iv_transid.
    COMMIT WORK.
  ENDMETHOD.

  METHOD diff.
    DATA(lo_d) = CAST cl_abap_structdescr( cl_abap_typedescr=>describe_by_data( is_a ) ).
    DATA lv_list TYPE string.
    DATA lv_n TYPE i.
    LOOP AT lo_d->components ASSIGNING FIELD-SYMBOL(<c>).
      IF <c>-name CP 'ER*' OR <c>-name CP 'LAE*' OR <c>-name CP 'AEN*' OR <c>-name = 'MATNR' OR <c>-name CP 'VPSTA' OR <c>-name = 'PSTAT'
         OR <c>-name = 'MANDT' OR <c>-name CP 'LVORM' OR <c>-name = 'BWKEY'.
        CONTINUE.
      ENDIF.
      ASSIGN COMPONENT <c>-name OF STRUCTURE is_a TO FIELD-SYMBOL(<a>).
      ASSIGN COMPONENT <c>-name OF STRUCTURE is_b TO FIELD-SYMBOL(<b>).
      IF sy-subrc = 0 AND <a> <> <b>.
        lv_n = lv_n + 1.
        lv_list = lv_list && <c>-name && '(' && |{ <a> }| && '>' && |{ <b> }| && ') '.
      ENDIF.
    ENDLOOP.
    rv_text = |{ iv_name }: { lv_n } differing field(s) { lv_list }|.
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    " 2. bad data: the test run must stop it and nothing may be created
    stage( 'ZZZZZZZ9' ).
    DATA(lo1) = NEW zcl_mm_mdm_poster( ).
    TRY.
        lo1->post( iv_transid = c_tid iv_app_id = 'MC' ).
        out->write( 'FAIL 2: bad data was accepted' ).
      CATCH zcx_mm_mdm INTO DATA(lx1).
        out->write( |ok   2 test run stopped it with { lines( lx1->mt_msg ) } message(s): { lx1->mt_msg[ 1 ]-message }| ).
    ENDTRY.
    IF lo1->mv_matnr IS NOT INITIAL.
      SELECT SINGLE matnr FROM mara WHERE matnr = @lo1->mv_matnr INTO @DATA(lv_x).
      out->write( COND #( WHEN sy-subrc = 0 THEN |FAIL 2b: material { lo1->mv_matnr } exists| ELSE |ok   2b nothing created (number { lo1->mv_matnr } drawn only)| ) ).
    ENDIF.

    " 5. clone of a real material, all common views, compared field by field with the original
    DATA(lv_src) = CONV matnr( '000000000100003623' ).
    SELECT SINGLE * FROM mara WHERE matnr = @lv_src INTO @DATA(ls_mara).
    SELECT SINGLE * FROM marc WHERE matnr = @lv_src INTO @DATA(ls_marc).
    SELECT SINGLE * FROM mard WHERE matnr = @lv_src AND werks = @ls_marc-werks INTO @DATA(ls_mard).
    SELECT SINGLE * FROM mbew WHERE matnr = @lv_src AND bwkey = @ls_marc-werks AND bwtar = @space INTO @DATA(ls_mbew).
    SELECT SINGLE * FROM mvke WHERE matnr = @lv_src INTO @DATA(ls_mvke).
    DATA ls_s_mara TYPE /inowits/mm_mara.
    DATA ls_s_marc TYPE /inowits/mm_marc.
    DATA ls_s_mard TYPE /inowits/mm_mard.
    DATA ls_s_mbew TYPE /inowits/mm_mbew.
    DATA ls_s_mvke TYPE /inowits/mm_mvke.
    MOVE-CORRESPONDING ls_mara TO ls_s_mara.  ls_s_mara-transid = c_tid.  CLEAR ls_s_mara-matnr.  ls_s_mara-maktx = 'ZZ CLONE DELETE ME'.
    MOVE-CORRESPONDING ls_marc TO ls_s_marc.  ls_s_marc-transid = c_tid.  CLEAR ls_s_marc-matnr.
    MOVE-CORRESPONDING ls_mard TO ls_s_mard.  ls_s_mard-transid = c_tid.  CLEAR ls_s_mard-matnr.
    MOVE-CORRESPONDING ls_mbew TO ls_s_mbew.  ls_s_mbew-transid = c_tid.  CLEAR ls_s_mbew-matnr.
    MOVE-CORRESPONDING ls_mvke TO ls_s_mvke.  ls_s_mvke-transid = c_tid.  CLEAR ls_s_mvke-matnr.
    clean_up( ).
    INSERT /inowits/mm_mara FROM @ls_s_mara.
    INSERT /inowits/mm_marc FROM @ls_s_marc.
    INSERT /inowits/mm_mard FROM @ls_s_mard.
    INSERT /inowits/mm_mbew FROM @ls_s_mbew.
    INSERT /inowits/mm_mvke FROM @ls_s_mvke.
    INSERT /inowits/mm_makt FROM @( VALUE #( transid = c_tid spras = 'E' maktx = 'ZZ CLONE DELETE ME' ) ).
    INSERT /inowits/m_vwsel FROM @( VALUE #( transid = c_tid mara_basic1 = 'X' mara_basic2 = 'X' mara_plnt1 = 'X' mara_plnt2 = 'X' marc_gen = 'X'
                                              marc_mrp1 = 'X' marc_mrp2 = 'X' marc_mrp3 = 'X' marc_mrp4 = 'X' marc_purc = 'X' marc_cost1 = 'X'
                                              mbew_acc1 = 'X' mbew_acc2 = 'X' mbew_cost2 = 'X' mvke_sorg1 = 'X' mvke_sorg2 = 'X' ) ).
    INSERT /inowits/m_trans FROM @( VALUE #( transid = c_tid app_id = 'MC' ) ).
    SELECT SINGLE * FROM j_1imtchid WHERE j_1ichid <> @space INTO @DATA(ls_chid_src).
    DATA ls_s_exse TYPE /inowits/mm_exse.
    MOVE-CORRESPONDING ls_chid_src TO ls_s_exse.
    ls_s_exse-transid = c_tid.
    CLEAR ls_s_exse-matnr.
    INSERT /inowits/mm_exse FROM @ls_s_exse.
    INSERT /inowits/mm_text FROM @( VALUE #( transid = c_tid fid = 'GRUN' text = 'Throw-away basic text from the poster test' ) ).
    COMMIT WORK.
    DATA(lo5) = NEW zcl_mm_mdm_poster( ).
    TRY.
        lo5->post( iv_transid = c_tid iv_app_id = 'MC' ).
      CATCH zcx_mm_mdm INTO DATA(lx5).
        LOOP AT lx5->mt_msg ASSIGNING FIELD-SYMBOL(<m5>).
          out->write( |FAIL 5: { <m5>-code } { <m5>-message } [{ <m5>-target }]| ).
        ENDLOOP.
        clean_up( ).
        RETURN.
    ENDTRY.
    out->write( |ok   5 clone created as { lo5->mv_matnr ALPHA = OUT } from { lv_src ALPHA = OUT } plant { ls_marc-werks }| ).
    SELECT SINGLE * FROM mara WHERE matnr = @lo5->mv_matnr INTO @DATA(ls_n_mara).
    SELECT SINGLE * FROM marc WHERE matnr = @lo5->mv_matnr AND werks = @ls_marc-werks INTO @DATA(ls_n_marc).
    SELECT SINGLE * FROM mard WHERE matnr = @lo5->mv_matnr AND werks = @ls_marc-werks INTO @DATA(ls_n_mard).
    SELECT SINGLE * FROM mbew WHERE matnr = @lo5->mv_matnr AND bwkey = @ls_marc-werks AND bwtar = @space INTO @DATA(ls_n_mbew).
    SELECT SINGLE * FROM mvke WHERE matnr = @lo5->mv_matnr AND vkorg = @ls_mvke-vkorg AND vtweg = @ls_mvke-vtweg INTO @DATA(ls_n_mvke).
    out->write( |rows found: MARA { xsdbool( ls_n_mara IS NOT INITIAL ) } MARC { xsdbool( ls_n_marc IS NOT INITIAL ) }| &&
                |  MARD { xsdbool( ls_n_mard IS NOT INITIAL ) } MBEW { xsdbool( ls_n_mbew IS NOT INITIAL ) }| &&
                |  MVKE { xsdbool( ls_n_mvke IS NOT INITIAL ) }| ).
    out->write( diff( is_a = ls_mara is_b = ls_n_mara iv_name = 'MARA' ) ).
    out->write( diff( is_a = ls_marc is_b = ls_n_marc iv_name = 'MARC' ) ).
    out->write( diff( is_a = ls_mard is_b = ls_n_mard iv_name = 'MARD' ) ).
    out->write( diff( is_a = ls_mbew is_b = ls_n_mbew iv_name = 'MBEW' ) ).
    out->write( diff( is_a = ls_mvke is_b = ls_n_mvke iv_name = 'MVKE' ) ).
    SELECT SINGLE j_1ichid, j_1isubind, j_1icapind FROM j_1imtchid WHERE matnr = @lo5->mv_matnr AND werks = @ls_marc-werks INTO @DATA(ls_chid_new).
    out->write( COND #( WHEN sy-subrc = 0 THEN |ok   6 India tax posted: chapter ID { ls_chid_new-j_1ichid } (source { ls_chid_src-j_1ichid })|
                        ELSE |FAIL 6: no J_1IMTCHID row for { lo5->mv_matnr }| ) ).
    SELECT SINGLE status, transid FROM /inowits/cm_meta WHERE matnr = @lo5->mv_matnr INTO @DATA(ls_meta).
    out->write( COND #( WHEN sy-subrc = 0 THEN |ok   7 meta row: status { ls_meta-status } request { ls_meta-transid ALPHA = OUT }| ELSE |FAIL 7: no CM_META row| ) ).
    SELECT SINGLE scode, scode1, scode4 FROM /inowits/ph_d_m WHERE value = @lo5->mv_matnr INTO @DATA(ls_ph).
    out->write( COND #( WHEN sy-subrc = 0 THEN |ok   8 phonetic keys written: { ls_ph-scode } { ls_ph-scode1 } { ls_ph-scode4 }| ELSE |FAIL 8: no PH_D_M row| ) ).
    DATA lt_tl TYPE STANDARD TABLE OF tline.
    CALL FUNCTION 'READ_TEXT' EXPORTING id = 'GRUN' language = 'E' name = CONV tdobname( |{ lo5->mv_matnr }| ) object = 'MATERIAL'
      TABLES lines = lt_tl EXCEPTIONS OTHERS = 1.
    out->write( COND #( WHEN sy-subrc = 0 AND lt_tl IS NOT INITIAL THEN |ok   9 long text saved: "{ lt_tl[ 1 ]-tdline }"| ELSE |FAIL 9: long text not found| ) ).
    clean_up( ).

    " 10. change (MX) of the throw-away material: set a field, then clear it again; nothing else may move
    DATA(lv_mat) = CONV matnr( lo5->mv_matnr ).
    TRY.
        DATA(lt_found) = zcl_mm_mdm_change=>search( iv_text = 'ZZ CLONE' ).
        out->write( |ok  10a search found { lines( lt_found ) } material(s), first { VALUE #( lt_found[ 1 ]-matnr OPTIONAL ) ALPHA = OUT }| ).
        DATA(lt_scope) = zcl_mm_mdm_change=>get_scope( lv_mat ).
        out->write( |ok  10b scope rows { lines( lt_scope ) } ({ REDUCE string( INIT s = `` FOR o IN lt_scope NEXT s = s && o-kind && o-werks && o-lgort && o-vkorg && o-vtweg && ` ` ) })| ).
        DATA(ls_p) = VALUE #( lt_scope[ kind = 'P' ] OPTIONAL ).
        DATA(ls_s) = VALUE #( lt_scope[ kind = 'S' ] OPTIONAL ).
        DATA(lv_t1) = zcl_mm_mdm_change=>start_change( iv_matnr = lv_mat iv_werks = ls_p-werks iv_lgort = ls_p-lgort
                                                     iv_vkorg = ls_s-vkorg iv_vtweg = ls_s-vtweg iv_user = sy-uname ).
        COMMIT WORK.
        SELECT SINGLE bismt FROM /inowits/mm_mara WHERE transid = @lv_t1 INTO @DATA(lv_b0).
        SELECT SINGLE matnr FROM /inowits/mm_mara WHERE transid = @( zcl_mm_mdm_change=>base_id( lv_t1 ) ) INTO @DATA(lv_base).
        out->write( |ok  10c change request { lv_t1 ALPHA = OUT } started, staging has the material, base snapshot { COND #( WHEN lv_base IS NOT INITIAL THEN 'present' ELSE 'MISSING' ) }| ).
        zcl_mm_mdm_change=>check_allowed( lv_mat ).
        out->write( 'FAIL 10d: a second request for the same material was allowed' ).
      CATCH zcx_mm_mdm INTO DATA(lx10).
        out->write( |ok  10d second request refused: { lx10->mt_msg[ 1 ]-message }| ).
    ENDTRY.
    IF lv_t1 IS NOT INITIAL.
      SELECT SINGLE mtart, matkl, bismt FROM mara WHERE matnr = @lv_mat INTO @DATA(ls_before).
      SELECT SINGLE dismm, dispo FROM marc WHERE matnr = @lv_mat AND werks = @ls_p-werks INTO @DATA(ls_mc_before).
      UPDATE /inowits/mm_mara SET bismt = 'ZZOLD1' WHERE transid = @lv_t1.
      UPDATE /inowits/m_vwsel SET mara_basic1 = 'X' WHERE transid = @lv_t1.
      COMMIT WORK.
      TRY.
          NEW zcl_mm_mdm_poster( )->post( iv_transid = lv_t1 iv_app_id = 'MX' ).
          SELECT SINGLE mtart, matkl, bismt FROM mara WHERE matnr = @lv_mat INTO @DATA(ls_after).
          SELECT SINGLE dismm, dispo FROM marc WHERE matnr = @lv_mat AND werks = @ls_p-werks INTO @DATA(ls_mc_after).
          out->write( COND #( WHEN ls_after-bismt = 'ZZOLD1' AND ls_after-mtart = ls_before-mtart AND ls_after-matkl = ls_before-matkl
                                    AND ls_mc_after = ls_mc_before
                              THEN |ok  10e change posted: old material no. { ls_before-bismt } > { ls_after-bismt }, type/group/MRP data untouched|
                              ELSE |FAIL 10e: bismt { ls_after-bismt } mtart { ls_after-mtart } matkl { ls_after-matkl } marc { ls_mc_after-dismm }/{ ls_mc_after-dispo }| ) ).
        CATCH zcx_mm_mdm INTO DATA(lx11).
          LOOP AT lx11->mt_msg ASSIGNING FIELD-SYMBOL(<m10>).
            out->write( |FAIL 10e: { <m10>-code } { <m10>-message } [{ <m10>-target }]| ).
          ENDLOOP.
      ENDTRY.
      UPDATE /inowits/m_trans SET status = '03' WHERE transid = @lv_t1.
      COMMIT WORK.
      " second change: clear the field again
      TRY.
          DATA(lv_t2) = zcl_mm_mdm_change=>start_change( iv_matnr = lv_mat iv_werks = ls_p-werks iv_lgort = ls_p-lgort
                                                       iv_vkorg = ls_s-vkorg iv_vtweg = ls_s-vtweg iv_user = sy-uname ).
          COMMIT WORK.
          UPDATE /inowits/mm_mara SET bismt = '' WHERE transid = @lv_t2.
          UPDATE /inowits/m_vwsel SET mara_basic1 = 'X' WHERE transid = @lv_t2.
          COMMIT WORK.
          NEW zcl_mm_mdm_poster( )->post( iv_transid = lv_t2 iv_app_id = 'MX' ).
          SELECT SINGLE bismt FROM mara WHERE matnr = @lv_mat INTO @DATA(lv_cleared).
          out->write( COND #( WHEN lv_cleared IS INITIAL THEN |ok  10f a cleared field is cleared in SAP| ELSE |FAIL 10f: bismt is still { lv_cleared }| ) ).
          UPDATE /inowits/m_trans SET status = '03' WHERE transid = @lv_t2.
          COMMIT WORK.
        CATCH zcx_mm_mdm INTO DATA(lx12).
          out->write( |FAIL 10f: { lx12->mt_msg[ 1 ]-message }| ).
      ENDTRY.
      drop( lv_t1 ).
      IF lv_t2 IS NOT INITIAL. drop( lv_t2 ). ENDIF.
    ENDIF.

    " 11. extension (ME): a new storage location in the plant of the throw-away material
    SELECT lgort FROM t001l WHERE werks = @ls_p-werks INTO TABLE @DATA(lt_sl).
    LOOP AT lt_sl ASSIGNING FIELD-SYMBOL(<sl>).
      SELECT SINGLE lgort FROM mard WHERE matnr = @lv_mat AND werks = @ls_p-werks AND lgort = @<sl>-lgort INTO @DATA(lv_ex).
      IF sy-subrc <> 0.
        DATA(lv_new_sl) = <sl>-lgort.
        EXIT.
      ENDIF.
    ENDLOOP.
    IF lv_new_sl IS INITIAL.
      out->write( |skip 11: no free storage location in plant { ls_p-werks }| ).
    ELSE.
      TRY.
          DATA(lv_t3) = zcl_mm_mdm_change=>start_extension( iv_matnr = lv_mat iv_type = 'P' iv_werks = ls_p-werks iv_lgort = lv_new_sl iv_user = sy-uname ).
          COMMIT WORK.
          NEW zcl_mm_mdm_poster( )->post( iv_transid = lv_t3 iv_app_id = 'ME' ).
          SELECT SINGLE lgort FROM mard WHERE matnr = @lv_mat AND werks = @ls_p-werks AND lgort = @lv_new_sl INTO @DATA(lv_made).
          out->write( COND #( WHEN sy-subrc = 0 THEN |ok  11 extension posted: storage location { lv_new_sl } created in plant { ls_p-werks }|
                              ELSE |FAIL 11: storage location { lv_new_sl } not found| ) ).
        CATCH zcx_mm_mdm INTO DATA(lx13).
          LOOP AT lx13->mt_msg ASSIGNING FIELD-SYMBOL(<m13>).
            out->write( |FAIL 11: { <m13>-code } { <m13>-message } [{ <m13>-target }]| ).
          ENDLOOP.
      ENDTRY.
      IF lv_t3 IS NOT INITIAL. drop( lv_t3 ). ENDIF.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
