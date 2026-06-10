// Type declarations for mailtarget-headless core (src/core.mjs).

export interface OperationSummary {
  operationId: string;
  method: string;
  path: string;
  tag: string;
  summary: string;
  parameters: unknown[];
  hasBody: boolean;
}

export interface OperationDetail {
  operationId: string;
  method: string;
  path: string;
  tag: string;
  summary: string;
  description: string;
  parameters: Array<{
    name: string;
    in: string;
    required: boolean;
    type?: string;
    description: string;
  }>;
  requestBody: Record<string, string> | { note: string } | { type: string } | null;
}

export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  url: string;
  method: string;
  data: T;
}

export interface SpecInfo {
  title?: string;
  version?: string;
  baseUrl: string;
  operations: number;
  tags: string[];
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface Attachment {
  name: string;
  /** MIME type, e.g. "application/pdf" */
  type: string;
  /** base64-encoded content */
  data: string;
}

/** Payload for the Transmission API (transmission.mailtarget.co). */
export interface TransmissionPayload {
  subject: string;
  /** Sender; the email domain must be a verified sending domain. */
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress | EmailAddress[];
  bodyText?: string;
  bodyHtml?: string;
  /** Server-side template id; replaces bodyText/bodyHtml. */
  templateId?: string;
  substitutionData?: Record<string, unknown>;
  headers?: Record<string, string>;
  attachments?: Attachment[];
  /** Free-form key-values echoed into webhook events. */
  metadata?: Record<string, unknown>;
  optionsAttributes?: Record<string, unknown>;
  allRCPTto?: boolean;
}

export interface TransmissionResponse {
  transmissionId?: string;
  error?: string;
  message?: string;
  details?: string[];
}

export function loadSpec(): unknown;
export function baseUrl(): string;
export function token(): string;
export function transmissionUrl(): string;
export function listOperations(filter?: { tag?: string; search?: string }): OperationSummary[];
export function findOperation(idOrPath: string, method?: string): OperationSummary | null;
export function describeOperation(operationId: string): OperationDetail | null;
export function callOperation(req: {
  operationId?: string;
  method?: string;
  path?: string;
  pathParams?: Record<string, string | number>;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
}): Promise<ApiResult>;
export function sendTransmission(payload: TransmissionPayload): Promise<ApiResult<TransmissionResponse>>;
export function specInfo(): SpecInfo;
