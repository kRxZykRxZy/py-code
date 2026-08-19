# Paddle invoice history implementation notes

The account billing view must request Paddle transactions only for the authenticated account’s persisted `paddleCustomerId`. Paddle’s Transactions API lists paginated transaction records, and the API key needs `transaction.read` permission. [1]

An invoice PDF is retrieved per transaction. Paddle only makes this available for eligible billed or completed transactions and excludes zero-value transactions. The returned PDF URL expires after one hour, so GitFolio must request it on demand through a protected server procedure and must never persist or expose a reusable provider API credential. [2]

## References

[1]: https://developer.paddle.com/api-reference/transactions/list-transactions "Paddle Developer Docs: List transactions"
[2]: https://developer.paddle.com/api-reference/transactions/get-transaction-invoice "Paddle Developer Docs: Get a PDF invoice for a transaction"
