/*
   v7 Phase 4 (master prompt §N 4): "Paste error / dump text" - a client-side parser for SAP error texts, ST22 dumps,
   transport and IDoc numbers. It only proposes values; the agent confirms them before anything is saved.
*/
import type { SapDetails } from './types';

export interface ParsedSap {
  fields: Partial<SapDetails>;
  transports: string[];
  httpStatus: string | null;
}

const first = (re: RegExp, text: string, group = 1) => text.match(re)?.[group]?.trim() || null;
const all = (re: RegExp, text: string, group = 1) => [...new Set([...text.matchAll(re)].map((m) => m[group].trim()))];

/** Common ST22 runtime error names (any ALL_CAPS name after "Runtime Errors" is taken too). */
const DUMP_NAMES = /\b(TIME_OUT|MESSAGE_TYPE_X|SYNTAX_ERROR|RAISE_EXCEPTION|GETWA_NOT_ASSIGNED|DBSQL_[A-Z_]+|CONVT_[A-Z_]+|TSV_[A-Z_]+|ITAB_[A-Z_]+|COMPUTE_[A-Z_]+|OBJECTS_[A-Z_]+|UNCAUGHT_EXCEPTION|SAPSQL_[A-Z_]+|CX_[A-Z_]+)\b/;

export function parseSapText(raw: string): ParsedSap {
  const text = String(raw || '').replace(/\r/g, '');
  const f: Partial<SapDetails> = {};
  // Message class + number: "Message no. V1801", "Message no. V1 801", "Message class V1 number 801", "(V1/801)"
  const m1 = text.match(/Message\s*no\.?\s*([A-Z][A-Z0-9_/]{0,19}?)\s*[/ ]?\s*(\d{3})\b/i)
    ?? text.match(/Message\s+class\s*[:=]?\s*([A-Z0-9_/]{1,20})[\s\S]{0,40}?(?:number|no\.?)\s*[:=]?\s*(\d{3})\b/i)
    ?? text.match(/\(([A-Z][A-Z0-9_]{0,19})\/(\d{3})\)/);
  if (m1) { f.errorMessageClass = m1[1].toUpperCase(); f.errorMessageNo = m1[2]; }
  const tcode = first(/\b(?:t-?code|transaction(?:\s+code)?)\s*[:=]?\s*\/?n?((?:\/[A-Z0-9]+\/)?[A-Z][A-Z0-9_]{1,19})\b/i, text);
  if (tcode) f.tcode = tcode.toUpperCase();
  const dump = first(/Runtime\s+Errors?\s*[:\s]\s*([A-Z][A-Z0-9_]{3,40})/, text) ?? first(DUMP_NAMES, text);
  if (dump) f.shortDumpId = dump;
  const program = first(/\b(?:ABAP\s+)?Program\s*[:\s]\s*([A-Z/][A-Z0-9_/]{2,40})/, text);
  if (program) f.programName = program;
  const idoc = first(/\b(\d{16})\b/, text);
  if (idoc) f.idocNumber = idoc;
  const notes = all(/\b(?:SAP\s+)?Note\s*(?:no\.?|#)?\s*(\d{6,8})\b/gi, text);
  if (notes.length) f.sapNotes = notes;
  const sid = first(/\b(?:System|SID)\s*(?:ID)?\s*[:=]\s*([A-Z][A-Z0-9]{2})\b/, text);
  if (sid) f.sapSystem = sid;
  const client = first(/\bClient\s*[:=]?\s*(\d{3})\b/i, text);
  if (client) f.sapClient = client;
  // The error text: the first line that reads like an error, else the start of the paste.
  const line = text.split('\n').map((l) => l.trim()).find((l) => /error|failed|not\s+|exception|dump|short dump|cannot|invalid/i.test(l));
  const errorText = (line || text.trim()).slice(0, 500);
  if (errorText) f.errorText = errorText;
  return {
    fields: f,
    transports: all(/\b([A-Z][A-Z0-9]{2}K9\d{5})\b/g, text),
    httpStatus: first(/\bHTTP\s*(?:status\s*)?(?:code\s*)?[:=]?\s*([1-5]\d{2})\b/i, text),
  };
}
