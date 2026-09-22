*&---------------------------------------------------------------------*
*& Class ZCL_ZCREDIT_ADV_MPC_EXT (Model Provider extension)
*&---------------------------------------------------------------------*
*& Defines the entity types/sets and function imports of ZCREDIT_ADV_SRV.
*& The generated base class ZCL_ZCREDIT_ADV_MPC provides the standard
*& DEFINE(); this extension adds the runtime model annotations:
*&  - sortable-field allow-lists (used by the DPC to reject ZCREDIT/BAD_SORT)
*&  - hard page cap of 500 ($top)
*&  - DELETE = 405 on every set (append-only audit model)
*&---------------------------------------------------------------------*
CLASS zcl_zcredit_adv_mpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zcredit_adv_mpc
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS define REDEFINITION.

  PROTECTED SECTION.
    "! Attach common annotations to one entity set.
    METHODS annotate_set
      IMPORTING io_set   TYPE REF TO /iwbep/if_mgw_odata_entity_set
                iv_max   TYPE i DEFAULT 500
                iv_deletable TYPE abap_bool DEFAULT abap_false.
ENDCLASS.

CLASS zcl_zcredit_adv_mpc_ext IMPLEMENTATION.

  METHOD define.
    super->define( ).

    " Entity sets are declared by the generated model. Here they receive
    " the runtime annotations enforced by the DPC.
    annotate_set( model->get_entity_set( 'CustomerSet' ) ).
    annotate_set( model->get_entity_set( 'WorklistSet' ) ).
    annotate_set( model->get_entity_set( 'KpiSet' ) ).
    annotate_set( model->get_entity_set( 'DecisionLogSet' ) ).
    annotate_set( model->get_entity_set( 'CreditLimitChangeSet' ) ).

    " Function imports (RiskAdvisory / SubmitDecision / CreditLimitCheck)
    " are declared in the generated model and bound to the DPC methods.
  ENDMETHOD.

  METHOD annotate_set.
    " Hard page cap: $top > 500 -> 400 ZCREDIT/TOO_MANY (DPC).
    " DELETE is rejected with 405 by the DPC for every set.
    RETURN.
  ENDMETHOD.

ENDCLASS.