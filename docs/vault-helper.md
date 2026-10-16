# Vault helper

The unlocked vault is held by `qs-bitwarden-vault`, a separate process with
core dumps disabled. The DMS shell receives redacted metadata and only explicitly
requested secrets. This reduces crash-dump exposure; it cannot erase previously
revealed or typed values from the shell's managed memory.

Build and self-test all three helpers with `./scripts/build-helpers.sh` from the
plugin directory, or choose **Build helpers** in the vault warning. DMS executes only
local Cargo output, never binaries in `bin/`.

Each successful build and self-test records a source fingerprint beside the binary
as `<binary>.source-sha256`. The panel compares it with the crate's current build
inputs. Older source or a missing build record shows a warning with **Build helpers**
for the vault, quick-unlock or SSH helper, without locking the vault or disabling
a working helper. The panel also remembers the stamp each running process started
with. After rebuilding, restart DMS to load the vault helper, which survives
lock/unlock. Turn the SSH agent off and on in settings to load its new build;
quick-unlock starts a new helper for each operation. Nothing restarts automatically.
The warning clears once running helpers and on-disk builds match the source.
This records source freshness, not binary authenticity.

## What the helper holds, and what the shell holds

| | Helper | Shell |
|---|---|---|
| Session key | yes | a placeholder that says the helper has it |
| The item list | every item in full | names, usernames, websites, folders, flags such as "has a password" |
| Passwords, TOTP keys, passkeys, password history, notes, card numbers and codes, identity numbers, hidden custom fields | yes | only a value you reveal, while it is revealed; the whole item while you edit it |
| The master password a PIN, fingerprint or FIDO2 key opens | yes, for that unlock | a reference by name |
| What you type: the master password and PIN for unlocking, and the master password for a re-prompt | yes: typed into pinentry, a separate process, and passed to the helper | a reference by name |
| What else you type: the email login, the master password and new PIN when setting up PIN, fingerprint or FIDO2 unlock, and an item's fields | | yes, until you submit, and in memory after |

Opening an item shows its name, username, websites, card brand, holder and
expiry, identity name, email, address and phone, plain custom fields and
attachment names. Each secret is a masked row, and notes are hidden until you
click their eye button. Revealing one asks the helper for that one value; the
shell keeps it until you hide it, close the item or open another, leave the
screen, close the panel or lock. Editing asks for the whole item and drops it
when the form is left. These values are dropped, not wiped: a dropped value
can stay in the shell's memory until that memory is reused, so a shell core
dump taken after you revealed something can still contain it.

A password or other secret you copy goes from the helper straight to
`wl-copy` (with the same timed clear and "sensitive" marking); it never passes
through the shell. TOTP codes are computed in the helper, and only the code
reaches the shell, not the key. Search runs in the helper too, so it still
finds text in notes the shell does not have, and it stays fast on a large
vault. Notes of an item that asks for the master password are not searched.

An item that asks for the master password asks for it before a value is
revealed, copied or edited, and its TOTP code is fetched only when you reveal
or copy it.

Locking, logging out and switching accounts tell the helper to forget
everything. A lock that is still running `bw lock` keeps its own copy of the
key until it finishes.

## How the shell talks to it

The shell starts the helper as its own child process and talks to it only on
the helper's stdin and stdout, one JSON object per line. There is no socket,
FIFO or port: no other program can connect to it or ask it anything.

Every `bw` command the panel runs goes through the helper, which adds
`BW_SESSION` (or a held password) to that one command's environment. Its
output is handed back as it is, except:

- a session key in it (`bw unlock`, `bw login`, a remembered session) is kept
  by the helper and replaced by a placeholder;
- the item list and a saved item are kept, and handed back with their
  secrets removed (the shell then asks for one value at a time: `field` to
  show it, `copyField` to copy it, `item` to edit);
- the master password a quick-unlock method opens is kept, and the shell gets
  a reference to it;
- a password or PIN typed into pinentry (below) is kept, and the shell gets
  only whether there was an answer.

## Typing into pinentry

A string typed into the panel stays in the shell's memory after the field is
cleared, so a shell core dump could hold it. The master password for
unlocking and for a re-prompt, and the PIN, are therefore typed into
`pinentry`, a separate process. The panel hides while it runs so it can take
the keyboard, and shows again after.

The helper runs a small script that speaks the pinentry protocol, and keeps
what it prints, decoded, under a name; the shell only learns whether you
answered or cancelled. The held password or PIN goes to `bw unlock`, the
quick-unlock check or the re-prompt check by name, and is forgotten as soon as
that has finished. A wrong password or PIN opens pinentry again with the
reason.

Pinentry closes itself after two minutes without an answer, which counts as
a cancel.

The pinentry used is `pinentry-qt` when it is runnable, else `pinentry` from
`PATH`, chosen each time it is needed; `pinentryProgram` in the DMS plugin settings
names another (used exactly as given, so `pinentry` means `pinentry` even with
`pinentry-qt` installed), and the setting "Type secrets in pinentry" turns
this off. The panel's own field is used instead only when pinentry is turned
off or confirmed not installed. The vault helper is still mandatory. "Not installed" is what a check
at start says when it runs to its end; a check that was killed says nothing,
and pinentry is still used.

Pinentry runs under the helper, so while the helper is starting, restarting
or left stopped the unlock screen and the re-prompt wait for it ("Waiting for
the vault helper...") with no field to type into. Offering the field then
would put the master password into the shell, and killing the helper is
something any program running as you can do.

A helper that does not answer `hello` within ten seconds is stopped with a
retry banner. A retry waits for the old process to exit before checking and
starting another helper; a late `ready` cannot activate the stopped process.

When pinentry fails to run or stops before answering, the panel says so and
the next attempt opens pinentry again. The panel's field is used only when you
pick "Type it here instead", and only until the panel closes or the vault
locks or unlocks. A failure is never remembered: any program running as you
can kill pinentry, and it must not be able to turn pinentry off that way and
have your master password typed into the shell.

When pinentry is ended from the panel's side (you open the panel, the vault
locks, another method unlocks it), the screen that asked is told, and an
answer pinentry gave just before is forgotten by the helper as well.

Quick-unlock answers that arrive after their authentication surface closes
are forgotten too. Locking cancels queued authentication opens and rejects
their late results by account and vault generation; envelope setup, re-seal
and purge writes keep their place in the queue. Removing a disabled method
also clears its legacy entry. A missing entry counts as already removed;
a keyring error is shown and cleanup gets at most three attempts, after
which restarting the shell permits another cleanup attempt. Account changes
settle cancelled purges and restore their attempt budget. Reenabling a method
invalidates its old queued purges, retries and completions across accounts,
so those cannot remove a newly stored wrap or mark it already removed.
Envelope lookup errors, including killed lookups, fail cleanup; only a
missing entry (exit 1 with no stderr) counts as already removed.

### Which pinentry

A pinentry that draws its own prompt (`pinentry-qt`, `pinentry-gtk`,
`pinentry-curses`, `pinentry-tty`) is a child of the helper: what you type is
in its memory and the helper's, and both have the helper's zero core-file
limit. `pinentry-gnome3` is different: it hands the prompt to `gcr-prompter`
over D-Bus, which the session bus starts, not the helper. `gcr-prompter` does
not have the helper's limit, and what you type passes through it, so if it
crashes its core dump can contain your master password or PIN. The plugin
does not lower any other process's limit (see "Limits" below). Left unset,
the plugin therefore prefers `pinentry-qt`, which draws its own prompt and
always has a show/hide button, and falls back to `pinentry` from `PATH` only
when `pinentry-qt` is not runnable. Without `pinentry-qt`, check
what `pinentry` on your `PATH` runs; on some systems (Arch among them) it is a
script that picks `pinentry-gnome3`. Set `pinentryProgram` to name a pinentry
yourself.

The email login, the setup of PIN, fingerprint and FIDO2 unlock (the master
password and the new PIN) and the item forms are not covered.

## Hardening

Before it reads anything, the helper sets its core-file limit to zero (soft
and hard) and makes itself non-dumpable, so no core is written for it and
other programs cannot attach to it or read its memory. Buffers holding
secrets are wiped when dropped; as with the SSH helper, that is best effort
and cannot cover memory the allocator or the kernel keeps. Neither helper
locks its memory, so the session key can be written to swap; encrypted swap,
or zram with no disk swap, avoids that. Release builds abort on panic rather
than unwinding.

The commands it runs inherit the zero core limit, so a `bw` that crashes
while holding your decrypted vault does not leave a core either. So does a
pinentry that draws its own prompt, but not a program a command reaches some
other way, such as `gcr-prompter` for `pinentry-gnome3`
([Which pinentry](#which-pinentry)).

## Limits

- **Other programs running as you are not kept out.** `bw` takes the session
  key only in its environment, and Linux lets any process running as the same
  user read another's `/proc/<pid>/environ`, so the key is readable while a
  `bw` command runs. That was true before the helper and is true of `bw`
  everywhere; see [SECURITY.md](../SECURITY.md) for what is in scope.
- **What is on screen, and what you type, is in the shell.** That is what you
  type into the panel's own fields (the email login, item fields, quick-unlock
  setup, and the master password or PIN when pinentry is not used). Clearing it does not wipe
  it, so it can stay in the shell's memory and be in a shell core dump.
- **The shell's core dumps are left on.** The plugin does not lower the
  shell's core-file limit. The limit is per process and inherited, so it would
  also turn off core dumps for every other plugin in the shell and for every
  app started from the shell's launcher, until the shell restarts. The plugin
  keeps secrets out of the shell instead.
- **`pinentry-gnome3` types into `gcr-prompter`**, which D-Bus starts outside
  the helper, so the zero core limit does not cover what you type there
  ([Which pinentry](#which-pinentry)).
- **Code running in the shell.** The helper does not protect against it.
  Such code can ask the helper to run a command with the session key or a
  held password in its environment.
- **The master-password reprompt** is checked by the panel, not the helper.

## If the helper is missing or fails

Only `vault/target/debug/qs-bitwarden-vault` is eligible. Before starting it,
the plugin checks executable permissions, ELF architecture, protocol version
and its self-test. A failed check or missing helper leaves the vault locked;
DMS does not permit the full-vault fallback in the shell. Build locally and
use the retry banner. A helper that stops while unlocked invalidates the
session and the SSH agent's keys and grants. Restart attempts are bounded.

For a missing helper, a protocol or checksum mismatch, or a failed self-test,
the banner offers **Build helpers**. A self-test failure can come from a stale
build after an update, but rebuilding may not fix a machine-specific failure.
The action runs this checkout's
`scripts/build-helpers.sh` in a terminal and requires Rust/Cargo. If Cargo is
missing, it offers `sudo pacman -S --needed rust` on pacman systems; elsewhere,
install Rust/Cargo with your distribution's package manager.

After the terminal process exits, the panel rechecks all three helpers without
restarting an active vault. If your terminal launcher detaches, use **Check helpers
again** on the source warning once the build finishes. The locked-vault warning
text also retries after a manual build or repair. Cargo itself is not a runtime
requirement, so its absence does not block users with working local helpers.

## Checking a local build

```sh
./scripts/build-helpers.sh
cargo test --manifest-path vault/Cargo.toml --locked
vault/target/debug/qs-bitwarden-vault --self-test
```

These checks validate the local source build. They do not claim provenance or
byte-for-byte identity with upstream release binaries.
