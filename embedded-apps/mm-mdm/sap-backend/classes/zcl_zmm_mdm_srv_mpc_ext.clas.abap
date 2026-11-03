"! Model provider extension. The model comes from the import of odata/metadata.xml in SEGW; nothing has to be redefined for the
"! first version. Use this class later for the things that SEGW cannot express, for example:
"!  - conversion exits on properties (ALPHA for TransId, MATN1 for material numbers, CUNIT for units): set them in the property
"!    definition in SEGW where possible (field "Conversion Exit"), otherwise here after SUPER->DEFINE.
"!  - labels and sap: annotations for filter and sort restrictions.
CLASS zcl_zmm_mdm_srv_mpc_ext DEFINITION PUBLIC INHERITING FROM zcl_zmm_mdm_srv_mpc CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS define REDEFINITION.
ENDCLASS.

CLASS zcl_zmm_mdm_srv_mpc_ext IMPLEMENTATION.
  METHOD define.
    super->define( ).
    "Example (property name as in the model):
    "  DATA(lo_entity) = model->get_entity_type( iv_entity_name = 'Request' ).
    "  lo_entity->get_property( 'TransId' )->set_conversion_exit( 'ALPHA' ).
  ENDMETHOD.
ENDCLASS.
