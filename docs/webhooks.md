# GitHubFolio webhook configuration

## Paddle billing webhook

Configure Paddle to send deliveries to `https://<published-domain>/api/paddle/webhook`. The endpoint verifies the `Paddle-Signature` header against `PADDLE_WEBHOOK_SECRET`, accepts only deliveries no more than five minutes from its signed timestamp, records each provider event ID once, and synchronizes the supported subscription lifecycle events.

Enable `subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `transaction.completed`, `transaction.paid`, `transaction.payment_failed`, and `transaction.past_due`.

## Optional GitHub repository webhook

GitHub OAuth and GitHub webhooks are separate integrations. The configured OAuth client ID and client secret authenticate the GitHub sign-in flow; they do **not** create or supply a webhook-signing secret. GitHub’s webhook setup presents a separate optional **Secret** field, where the webhook owner chooses a high-entropy value. [1] [2]

The prepared endpoint is `https://<published-domain>/api/github/webhook`. It remains fail-closed until a `GITHUB_WEBHOOK_SECRET` environment value is configured. When activating it, create an organization, repository, or GitHub App webhook, choose the same new high-entropy secret in both places, select JSON payloads, and subscribe to `push`, `repository`, `installation`, and `installation_repositories`. It verifies the `X-Hub-Signature-256` HMAC header, deduplicates delivery IDs, and marks the matching GitHub connection stale for the normal sync flow.

Do not reuse the GitHub OAuth client secret as a webhook secret. Generate a dedicated random value at the time the webhook is created.

## References

[1]: https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks "GitHub Docs: Creating webhooks"
[2]: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps "GitHub Docs: Authorizing OAuth apps"
