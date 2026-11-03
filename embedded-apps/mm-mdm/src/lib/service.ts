import type { AttachmentItem, CommentItem, DuplicateHit, FilePayload, FieldControl, ListQuery, Message, RequestData, RequestHeader, RequestView, SessionInfo, StartInput, ValueHelpItem } from '@/lib/types';

export interface Caller {
  /** SAP user id (live) or demo user id (mock) */
  user: string;
  /** Credentials or token forwarded to SAP in live mode (see auth.ts) */
  authorization?: string;
}

export type WorkflowAction = 'approve' | 'sendback' | 'reject' | 'forward';

export class ServiceError extends Error {
  constructor(public status: number, message: string, public messages: Message[] = []) {
    super(message);
  }
}

export interface MdmService {
  session(c: Caller): Promise<SessionInfo>;
  listRequests(c: Caller, q: ListQuery): Promise<RequestHeader[]>;
  getRequest(c: Caller, id: string): Promise<RequestView>;
  startRequest(c: Caller, input: StartInput): Promise<RequestView>;
  saveRequest(c: Caller, id: string, data: RequestData): Promise<{ request: RequestView; messages: Message[] }>;
  validate(c: Caller, id: string, data: RequestData): Promise<Message[]>;
  submit(c: Caller, id: string, data: RequestData): Promise<{ request: RequestView; messages: Message[] }>;
  act(c: Caller, id: string, action: WorkflowAction, body: { comment?: string; agent?: string; data?: RequestData }): Promise<{ request: RequestView; messages: Message[] }>;
  deleteDraft(c: Caller, id: string): Promise<void>;
  fieldControl(c: Caller, materialType: string, level: string): Promise<FieldControl>;
  valueHelp(c: Caller, name: string, params: Record<string, string>): Promise<ValueHelpItem[]>;
  duplicates(c: Caller, input: { description: string; materialType: string }): Promise<DuplicateHit[]>;
  buildDescription(c: Caller, input: { mainGroup?: string; subGroup?: string; subSubGroup?: string; description: string; manufacturerPart?: string }): Promise<{ text: string; truncated: boolean }>;
  relatedHsn(c: Caller, text: string): Promise<Array<{ code: string; text: string; count: number }>>;
  listAttachments(c: Caller, id: string): Promise<AttachmentItem[]>;
  addAttachment(c: Caller, id: string, file: FilePayload): Promise<AttachmentItem>;
  readAttachment(c: Caller, id: string, attachId: string): Promise<FilePayload>;
  deleteAttachment(c: Caller, id: string, attachId: string): Promise<void>;
  listComments(c: Caller, id: string): Promise<CommentItem[]>;
  addComment(c: Caller, id: string, text: string): Promise<CommentItem>;
}
