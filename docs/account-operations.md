# Account operations

The account operations page at `/account-ops` uses the selected CPA instance's
`/v8/management/account-ops` API through the authenticated OMC management facade.
It provides order previews, local records, batch jobs, explicit reauthorization,
write-only credential updates, preferences and durable event history. Previewed
passwords and TOTP secrets are never returned or stored in browser storage.

The worker is a separate Python service on the CPA host. It owns an independent
encryption key and database. OMC owns neither this password vault nor a Docker
socket. Every modifying facade request is audited before forwarding, including
private import drafts. Responses use handwritten DTOs; worker errors never pass
through arbitrary response text. Existing OMC authentication, the `/omc` base path
and demo write restrictions remain in effect.

The deployment must supply the worker socket and service token to CPA. Worker
capabilities are authoritative: browser operations are disabled when unavailable,
and unsupported proxy allocation is not presented as a working feature. The DMIT
deployment keeps automatic reauthorization disabled and preserves proxies by
default. Clouvider cron ownership requires a separate verified handoff. Human
challenges retain the job; direct browser takeover is not currently exposed by OMC.

Jobs retain their ID across navigation and refresh. The credentials editor is
write-only and clears its inputs after success. Saved credentials are scoped to
the exact selected account/workspace. Configuration conflicts require a new
submission after reviewing current state. Reauthorization preserves account
settings; a new-account priority increase requires a fresh candy evaluation.
Failures after login remain visible as partial completion.

Notification delivery and privileged IPv6 allocation are explicit deployment
helpers. Missing notification delivery leaves a pending outbox entry for retry;
it is never reported as a delivered message. Local order records are independent
of Feishu; no Feishu integration is included. Legacy imports report incomplete
history rather than implying that an old script's retained snapshots are a
complete task archive.

The source fork is `Yorick-Ryu/oh-my-cpa`, based on the deployed v0.3.5 revision.
The facade is in `internal/api/management_account_ops.go`; the client is in
`internal/cpa/management/client_account_ops.go`; the page is in
`web/src/pages/accountOps/AccountOpsPage.tsx`. The matching worker and its install
contract are maintained in the CPA fork under `tools/account-ops`.

Build with the pinned toolchain and `pnpm build`; verify with `pnpm verify:full`
and `pnpm check:ui`. Install a custom image pinned to its digest or immutable
version tag so the official updater cannot replace the customization.
