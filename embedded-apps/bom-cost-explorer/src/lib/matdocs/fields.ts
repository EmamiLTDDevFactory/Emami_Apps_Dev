/**
 * MatDocSet of ZMM_BOM_COST_SRV (read-only, class ZCL_MM_MAT_DOCS): the SPECIFICATION (title SPEC_...) and ARTWORK (title ARTWORK_...)
 * PDFs attached in the material master (GOS) of RM / PM / FG materials (ROH, VERP, PKGN, FERT).
 * Filters: Matnr (one or more, required), DocType SPEC / ART, Mode L latest (default) / V all versions / C content chunk, DocId, Chunk.
 * A content chunk (Mode C) carries part Chunk of Chunks of the PDF as base64; SAP only reads a document for a material it is attached to.
 */
import type { FieldMap } from '../price-context/odata';

export const MATDOC_SET = 'MatDocSet';
export const MATDOC_FIELDS = {
  Rowid: ['Rowid', 's'], Mode: ['Mode', 's'], Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Mtart: ['Mtart', 's'], DocType: ['DocType', 's'], DocId: ['DocId', 's'],
  Title: ['Title', 's'], FileExt: ['FileExt', 's'], CreatedBy: ['CreatedBy', 's'], AttTs: ['AttTs', 's'], Msg: ['Msg', 's'], Crdat: ['Crdat', 't'],
  DocSize: ['DocSize', 'i'], Versions: ['Versions', 'i'], Chunk: ['Chunk', 'i'], Chunks: ['Chunks', 'i'], Content: ['Content', 's'],
} as const satisfies FieldMap;

type KindType = { s: string; d: string; i: number; t: string | null; b: boolean; f: boolean };
export type MatDocRow = { [K in keyof typeof MATDOC_FIELDS]: KindType[(typeof MATDOC_FIELDS)[K][1]] };
export type MatDocType = 'SPEC' | 'ART';
export const DOC_LABEL: Record<MatDocType, string> = { SPEC: 'Specification', ART: 'Artwork' };
