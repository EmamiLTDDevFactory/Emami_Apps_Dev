"! Shared types and constants of the material master request service.
"! Create in SE24 as an interface, package ZMM_MDM.
INTERFACE zif_mm_mdm_types PUBLIC.

  TYPES ty_transid TYPE /inowits/transid.
  TYPES ty_app_id  TYPE /inowits/wf_app_id.

  "One message returned to the caller. Same shape as the OData complex type Message.
  TYPES: BEGIN OF ty_msg,
           code     TYPE c LENGTH 20,
           message  TYPE string,
           severity TYPE c LENGTH 1,      "E error, W warning, I information, S success
           target   TYPE string,          "Entity/FIELD, for example Plant/DISMM
         END OF ty_msg,
         tt_msg TYPE STANDARD TABLE OF ty_msg WITH DEFAULT KEY.

  "Input of StartRequest (key data screen)
  TYPES: BEGIN OF ty_start,
           material_type        TYPE mtart,
           industry_sector      TYPE mbrsh,
           description          TYPE maktx,
           main_group           TYPE c LENGTH 40,
           sub_group            TYPE c LENGTH 40,
           sub_sub_group        TYPE c LENGTH 40,
           manufacturer_part    TYPE c LENGTH 40,
           plant                TYPE werks_d,
           storage_location     TYPE lgort_d,
           sales_org            TYPE vkorg,
           distribution_channel TYPE vtweg,
           views                TYPE string,         "comma separated view names (flags of /INOWITS/M_VWSEL)
           draft                TYPE abap_bool,
         END OF ty_start.

  "Routing keys of the workflow definition (GEN_FIELD to GEN_FIELD4)
  TYPES: BEGIN OF ty_routing,
           gen_type   TYPE /inowits/wf_gen_type,
           gen_field  TYPE /inowits/wf_gen_field,
           gen_field2 TYPE /inowits/wf_gen_field2,
           gen_field3 TYPE /inowits/wf_gen_field3,
           gen_field4 TYPE /inowits/wf_gen_field4,
         END OF ty_routing.

  TYPES: BEGIN OF ty_allowed,
           edit         TYPE abap_bool,
           validate     TYPE abap_bool,
           save_draft   TYPE abap_bool,
           submit       TYPE abap_bool,
           approve      TYPE abap_bool,
           send_back    TYPE abap_bool,
           reject       TYPE abap_bool,
           forward      TYPE abap_bool,
           delete_draft TYPE abap_bool,
         END OF ty_allowed.

  TYPES: BEGIN OF ty_item,                "value help line
           key  TYPE string,
           text TYPE string,
         END OF ty_item,
         tt_item TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.

  "Header status, domain /INOWITS/TRNAS_STATUS
  CONSTANTS: BEGIN OF gc_status,
               draft       TYPE c LENGTH 2 VALUE '00',
               requested   TYPE c LENGTH 2 VALUE '01',
               in_progress TYPE c LENGTH 2 VALUE '02',
               completed   TYPE c LENGTH 2 VALUE '03',
               sent_back   TYPE c LENGTH 2 VALUE '04',
               rejected    TYPE c LENGTH 2 VALUE '05',
             END OF gc_status.

  "Item status of the history, domain /INOWITS/MDM_ITEM_STATUS
  CONSTANTS: BEGIN OF gc_item_status,
               initiated TYPE c LENGTH 1 VALUE 'I',
               forwarded TYPE c LENGTH 1 VALUE 'F',
               completed TYPE c LENGTH 1 VALUE 'C',
               sent_back TYPE c LENGTH 1 VALUE 'S',
               rejected  TYPE c LENGTH 1 VALUE 'R',
             END OF gc_item_status.

  CONSTANTS gc_app_create    TYPE c LENGTH 6 VALUE 'MC'.
  CONSTANTS gc_app_type      TYPE c LENGTH 1 VALUE 'S'.            "/INOWITS/APP_TYPE: S = material
  CONSTANTS gc_level_initiator TYPE c LENGTH 2 VALUE 'L0'.
  CONSTANTS gc_wi_ready      TYPE c LENGTH 10 VALUE 'READY'.
  CONSTANTS gc_msg_class     TYPE arbgb VALUE '/INOWITS/CL_MDM_MSG'.

ENDINTERFACE.
