const PADDLE_API_BASE_URL = "https://api.paddle.com";

type FetchLike = typeof fetch;

type PaddleTransactionPayload = {
  id: string;
  customer_id: string | null;
  status: string;
  created_at: string;
  billed_at?: string | null;
  invoice_number?: string | null;
  currency_code?: string | null;
  details?: { totals?: { total?: string | null } | null } | null;
};

type PaddleEnvelope<T> = { data: T; meta?: { pagination?: { next?: string | null } } };

export type InvoiceHistoryItem = {
  id: string;
  status: string;
  createdAt: string;
  billedAt: string | null;
  invoiceNumber: string | null;
  currencyCode: string | null;
  total: string | null;
  invoiceAvailable: boolean;
};

export class PaddleBillingError extends Error {
  constructor(message: string, readonly code: "not-configured" | "provider-error" | "not-found") {
    super(message);
  }
}

function paddleRequestUrl(path: string, query?: Record<string, string | undefined>) {
  const url = new URL(path, process.env.PADDLE_API_BASE_URL || PADDLE_API_BASE_URL);
  for (const [key, value] of Object.entries(query || {})) if (value) url.searchParams.set(key, value);
  return url;
}

async function paddleRequest<T>(path: string, options: { query?: Record<string, string | undefined>; fetchImpl?: FetchLike } = {}): Promise<T> {
  const token = process.env.PADDLE_API_KEY;
  if (!token) throw new PaddleBillingError("Paddle billing is not configured.", "not-configured");
  const response = await (options.fetchImpl || fetch)(paddleRequestUrl(path, options.query), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) throw new PaddleBillingError("Paddle billing is temporarily unavailable.", response.status === 404 ? "not-found" : "provider-error");
  return response.json() as Promise<T>;
}

function invoiceAvailable(transaction: PaddleTransactionPayload) {
  const total = transaction.details?.totals?.total;
  if (!total || /^0+$/.test(total)) return false;
  return transaction.status === "completed" || (transaction.status === "billed" && true);
}

function toInvoiceHistoryItem(transaction: PaddleTransactionPayload): InvoiceHistoryItem {
  return {
    id: transaction.id,
    status: transaction.status,
    createdAt: transaction.created_at,
    billedAt: transaction.billed_at || null,
    invoiceNumber: transaction.invoice_number || null,
    currencyCode: transaction.currency_code || null,
    total: transaction.details?.totals?.total || null,
    invoiceAvailable: invoiceAvailable(transaction),
  };
}

export async function listPaddleInvoiceHistory(customerId: string, after?: string, fetchImpl?: FetchLike) {
  if (!customerId.startsWith("ctm_")) return { items: [] as InvoiceHistoryItem[], next: null as string | null };
  const envelope = await paddleRequest<PaddleEnvelope<PaddleTransactionPayload[]>>("/transactions", {
    query: { customer_id: customerId, after, per_page: "30", order_by: "created_at[DESC]" },
    fetchImpl,
  });
  const items = envelope.data.filter((transaction) => transaction.customer_id === customerId).map(toInvoiceHistoryItem);
  const nextUrl = envelope.meta?.pagination?.next;
  const next = nextUrl ? new URL(nextUrl).searchParams.get("after") : null;
  return { items, next };
}

export async function getPaddleInvoiceUrl(customerId: string, transactionId: string, fetchImpl?: FetchLike) {
  if (!customerId.startsWith("ctm_") || !/^txn_[a-z0-9]{8,}$/i.test(transactionId)) throw new PaddleBillingError("Invoice not found.", "not-found");
  const transaction = await paddleRequest<PaddleEnvelope<PaddleTransactionPayload>>(`/transactions/${transactionId}`, { fetchImpl });
  if (transaction.data.customer_id !== customerId || !invoiceAvailable(transaction.data)) throw new PaddleBillingError("Invoice is not available for this transaction.", "not-found");
  const invoice = await paddleRequest<PaddleEnvelope<{ url: string }>>(`/transactions/${transactionId}/invoice`, { query: { disposition: "inline" }, fetchImpl });
  if (!/^https:\/\//i.test(invoice.data.url)) throw new PaddleBillingError("Invoice is temporarily unavailable.", "provider-error");
  return { url: invoice.data.url };
}
