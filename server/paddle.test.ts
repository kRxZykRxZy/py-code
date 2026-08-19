import { afterEach, describe, expect, it, vi } from "vitest";
import { getPaddleInvoiceUrl, listPaddleInvoiceHistory, PaddleBillingError } from "./paddle";

const customerId = "ctm_0123456789abcdef";
const transaction = { id: "txn_0123456789abcdef", customer_id: customerId, status: "completed", created_at: "2026-08-19T10:00:00Z", currency_code: "USD", details: { totals: { total: "1200" } } };

afterEach(() => vi.unstubAllEnvs());

describe("Paddle invoice history", () => {
  it("lists only transactions belonging to the persisted customer", async () => {
    vi.stubEnv("PADDLE_API_KEY", "test-token");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [transaction, { ...transaction, id: "txn_foreign000000", customer_id: "ctm_other" }], meta: { pagination: { next: null } } }), { status: 200 }));
    await expect(listPaddleInvoiceHistory(customerId, undefined, fetchImpl as typeof fetch)).resolves.toEqual({ items: [expect.objectContaining({ id: transaction.id, invoiceAvailable: true })], next: null });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(`customer_id=${customerId}`);
  });

  it("issues an invoice URL only after checking the transaction belongs to the customer", async () => {
    vi.stubEnv("PADDLE_API_KEY", "test-token");
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: transaction }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { url: "https://example.test/invoice.pdf" } }), { status: 200 }));
    await expect(getPaddleInvoiceUrl(customerId, transaction.id, fetchImpl as typeof fetch)).resolves.toEqual({ url: "https://example.test/invoice.pdf" });
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/invoice?disposition=inline");
  });

  it("does not expose an invoice for a transaction owned by another customer", async () => {
    vi.stubEnv("PADDLE_API_KEY", "test-token");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: { ...transaction, customer_id: "ctm_other" } }), { status: 200 }));
    await expect(getPaddleInvoiceUrl(customerId, transaction.id, fetchImpl as typeof fetch)).rejects.toMatchObject<PaddleBillingError>({ code: "not-found" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
