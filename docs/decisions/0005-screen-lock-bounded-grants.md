# 5. Program approvals may last until the screen locks

Date: 2026-10-14

## Status

Accepted. Amends ADR 0002's requirement that every approval grant has a
bounded time window and that a zero window disables grants. Its program-scoping
rule is unchanged.

## Context

The two-minute approval window repeatedly interrupts SSH signing during a
long unlocked desktop session. Increasing the timed maximum would only move
the next interruption, rather than tie approval to the user's session.

ADR 0002 says screen lock drops grants. The panel only did so indirectly by
locking the vault when `lockOnScreenLock` was enabled. With that setting off,
grants survived a screen lock. Suspend drops grants through vault locking
when `lockOnSuspend` is enabled.

## Decision

Add `sshAgentApprovalUntilScreenLock`, off by default. When enabled, the
program-grant action explicitly approves until screen lock instead of for
`sshAgentApprovalWindowSec` seconds. A zero timed window does not disable this
separate choice. Approve once and the default timed behaviour remain unchanged.
Timed grants retain the 900-second maximum.

An until-lock grant has no time expiry. Its scope remains the peer UID,
executable path captured at approval, public key and vault epoch. It lives
only in helper memory and disappears on vault lock, logout, account or epoch
change, screen lock, disabling the agent, explicit revocation or helper exit.
Suspend drops grants through vault lock when **Lock when the machine suspends**
is on. Unlocking never restores a grant. The final signing gate still
rechecks lock state, epoch and key identity.

The panel revokes every grant on screen lock, regardless of `lockOnScreenLock`.
Grant revocation does not cancel pending approval prompts; vault-lock behaviour
is unchanged. Revoking all grants downgrades program approvals recorded before
a key load finishes to approve once, so the held request still signs without
recreating a grant. Approve-once decisions are unchanged.

The control approval form carries `untilScreenLock: true` with
`grantSeconds: 0`. Conflicting durations are rejected. `grants_changed` carries
the same explicit mode and no expiry for the panel to display "until screen
lock" under ACTIVE APPROVALS. These grants remain individually revocable.

Advance only the control protocol to version 2, not the plugin or crate
version. The existing helper inspection, version handshake and self-test then
reject stale local binaries with the existing mismatch diagnostic. Merely
adding an optional field to version 1 would let an old helper pass inspection
and fail only when the user approved. No fallback turns an unsupported
until-lock approval into a different duration.

## Consequences

Any process with the same UID running the approved executable can request a
signature with the approved key throughout an unlocked session. That may be
hours rather than the timed maximum of fifteen minutes. This is a deliberate,
opt-in increase in exposure, not a stronger process identity check. Users who
need a time bound should leave the option off.

Screen lock now revokes timed grants even when it leaves the vault unlocked.
The next signature needs fresh approval. Suspend still drops grants only
through vault lock when **Lock when the machine suspends** is on. Grant lifetime
depends on the panel receiving desktop events; the helper does not independently
verify the compositor's lock state.

Users must rebuild a local helper after updating the panel. Old and new
control protocol versions fail closed rather than silently losing approvals.

## Alternatives considered

- **Raise or remove the timed cap.** Rejected. It changes the default security
  bound and still does not express approval for the current unlocked session.
- **Make every grant last until lock.** Rejected. Timed approvals remain the
  default and let users retain the shorter exposure.
- **Depend on vault locking to clear grants on screen lock.** Rejected. Screen
  lock must revoke grants even when `lockOnScreenLock` is off. Suspend keeps
  its existing vault-lock-dependent behaviour.
- **Keep protocol version 1 and rely on unknown-field rejection.** Rejected.
  A stale helper would appear compatible until an approval failed; version 2
  uses the existing pre-launch mismatch reporting instead.
