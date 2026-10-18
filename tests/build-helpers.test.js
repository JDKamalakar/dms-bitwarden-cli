const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { test } = require("node:test")
const { functionBody, loadModule, read } = require("./harness")
const Model = loadModule()
const de = JSON.parse(read("translations/de.json")).bitwarden

test("helper messages name the all-helper build script once, including in the locked banner", () => {
  for (const message of [Model.VAULT_HELPER_MESSAGES.missing,
    Model.UNLOCK_KEY_MESSAGES["protocol-mismatch"], Model.SSH_AGENT_HELPER_MESSAGES["self-test-failed"]]) {
    assert.ok(message.includes("scripts/build-helpers.sh"))
    assert.ok(!message.includes("cargo build"))
    assert.ok(de[message], message)
    const warning = Model.vaultHelperUnavailableWarning(message)
    assert.equal(warning.split("scripts/build-helpers.sh").length, 2)
    assert.ok(warning.includes("Click here to check again"))
  }
  const translated = Model.vaultHelperUnavailableWarning(Model.VAULT_HELPER_MESSAGES.missing, s => de[s] || s)
  assert.ok(translated.startsWith("Der Tresor bleibt gesperrt: "))
  assert.ok(translated.includes("im Plugin-Verzeichnis"))
  assert.ok(translated.endsWith("Zum erneuten Prüfen hier klicken."))
})

test("only repairable helper inspection failures offer a rebuild", () => {
  for (const state of ["missing", "protocol-mismatch", "self-test-failed", "checksum-mismatch"]) {
    assert.equal(Model.helperRebuildable({ state }), true)
  }
  for (const state of ["unknown", "ok", "not-a-file", "not-executable", "not-elf", "wrong-architecture", "unusable"]) {
    assert.equal(Model.helperRebuildable({ state }), false)
  }
  assert.equal(Model.helperRebuildable(null), false)
})

test("build command refuses invalid directories", () => {
  for (const dir of [undefined, null, {}, "", "relative", "file:///tmp/plugin", "/tmp/../plugin", "/tmp/./plugin", "/tmp/\0plugin"]) {
    assert.equal(Model.buildHelpersCommand(dir), null, String(dir))
  }
  assert.deepEqual(Model.buildHelpersCommand("/tmp/plugin///"), Model.buildHelpersCommand("/tmp/plugin"))
})

async function fixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qsbw-build-test-"))
  const bin = path.join(dir, "bin")
  const plugin = path.join(dir, "plugin ' $(touch INJECTED);\ncheckout")
  fs.mkdirSync(bin)
  fs.mkdirSync(path.join(plugin, "scripts"), { recursive: true })
  const stub = (name, body) => fs.writeFileSync(path.join(bin, name), "#!/bin/bash\n" + body, { mode: 0o755 })
  fs.symlinkSync("/bin/bash", path.join(bin, "bash"))
  stub("xdg-terminal-exec", 'printf "%s\\0" "$@" > "$CAPTURE"\nexec "$@" < "$INPUT"\n')
  fs.writeFileSync(path.join(plugin, "scripts/build-helpers.sh"), '#!/bin/bash\nprintf "built:%s\\n" "$PWD"\nprintf "args:%s\\n" "$*"\nexit "${BUILD_EXIT:-0}"\n')
  const command = Model.buildHelpersCommand(plugin)
  const env = { PATH: bin, TMPDIR: dir, CAPTURE: path.join(dir, "argv"), INPUT: path.join(dir, "input"), BW_SESSION: "untrusted-session", VAULT_ITEM: "$(touch INJECTED)" }
  fs.writeFileSync(env.INPUT, "\n")
  const exec = (input = "\n", extra = {}) => {
    fs.writeFileSync(env.INPUT, input)
    return spawnSync("/bin/bash", command.slice(1), {
      env: { ...env, ...extra }, encoding: "utf8", timeout: 10000, cwd: dir
    })
  }
  try { await run({ dir, plugin, stub, command, env, exec }) }
  finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

test("build command quotes the checkout, uses no vault data and propagates build errors", () => fixture(f => {
  f.stub("cargo", "exit 0\n")
  assert.equal(f.command[0], "bash")
  assert.ok(!f.command.join(" ").includes(f.env.BW_SESSION))
  assert.ok(!f.command.join(" ").includes("VAULT_ITEM"))
  const result = f.exec()
  assert.equal(result.status, 0, result.stderr)
  assert.ok(result.stdout.includes("built:" + f.plugin))
  assert.ok(result.stdout.includes("args:\n"))
  assert.equal(fs.existsSync(path.join(f.dir, "INJECTED")), false)
  assert.equal(fs.existsSync(path.join(f.plugin, "INJECTED")), false)
  const inner = fs.readFileSync(f.env.CAPTURE, "utf8").split("\0")
  assert.deepEqual(inner.slice(0, 2), ["bash", "-c"])
  const failed = f.exec("\n", { BUILD_EXIT: "37" })
  assert.equal(failed.status, 37, failed.stderr)
}))

test("missing Cargo on pacman offers Rust installation, then builds only on approval", () => fixture(f => {
  f.stub("pacman", "exit 0\n")
  f.stub("sudo", 'printf "sudo:%s\\n" "$*"\nexit "${INSTALL_EXIT:-0}"\n')
  const accepted = f.exec("y\n\n")
  assert.equal(accepted.status, 0, accepted.stderr)
  assert.ok(accepted.stdout.includes("cargo was not found"))
  assert.ok(accepted.stdout.includes("sudo:pacman -S --needed rust"))
  assert.ok(accepted.stdout.includes("built:" + f.plugin))
  for (const result of [f.exec("n\n\n"), f.exec("y\n\n", { INSTALL_EXIT: "1" })]) {
    assert.equal(result.status, 1, result.stderr)
    assert.ok(!result.stdout.includes("built:"))
  }
}))

test("missing Cargo without pacman gives manual instructions without building", () => fixture(f => {
  const result = f.exec()
  assert.equal(result.status, 1, result.stderr)
  assert.ok(result.stdout.includes("distribution package manager: rust"))
  assert.ok(result.stdout.includes("Press Enter to close"))
  assert.ok(!result.stdout.includes("built:"))
}))

test("running stamps survive a rebuild until the next process starts", () => {
  const sourceHash = "a".repeat(64), old = "b".repeat(64)
  const helper = { state: "ok", source: "development", sourceStamp: "match", sourceHash }
  assert.equal(Model.helperSourceOutdated(helper, old), true)
  assert.equal(Model.helperSourceOutdated(helper, ""), true)
  assert.equal(Model.helperSourceOutdated(helper, sourceHash), false)
  assert.equal(Model.helperSourceOutdated(helper), false)
  helper.sourceStamp = "missing"
  assert.equal(Model.helperSourceOutdated(helper), true)
})

test("a refresh finishing after a crash cannot bypass the vault restart limit", () => {
  const scope = { Model, vaultHelperState: "active", vaultHelperRestarts: 3,
    startVaultHelper() { this.starts++ }, useVaultFallback() { this.fallbacks++ }, starts: 0, fallbacks: 0 }
  const inspect = new Function("scope", "raw", "with(scope){" + functionBody(read("Service.qml"), "onVaultHelperInspected") + "; onVaultHelperInspected(raw) }")
  scope.vaultHelperState = "stopped"
  inspect(scope, "state=ok\nprotocol=1\nsource=development\nsourceStamp=match\n")
  assert.equal(scope.starts, 0)
  assert.equal(scope.vaultHelperRestarts, 3)
  scope.vaultHelperState = "pending"
  inspect(scope, "state=ok\nprotocol=1\n")
  assert.equal(scope.starts, 1)
  scope.vaultHelperState = "active"
  inspect(scope, "state=missing\n")
  assert.equal(scope.fallbacks, 0)
})

test("manual and build-exit rechecks refresh all helpers without retrying an active vault", () => {
  const seen = []
  const scope = { shuttingDown: false, vaultHelperState: "active",
    inspectVaultHelper() { seen.push("vault") }, retryVaultHelper() { seen.push("retry") },
    inspectUnlockKey() { seen.push("unlock-key") }, inspectSshAgentHelper() { seen.push("agent") },
    checkDependencies() { seen.push("deps") } }
  for (const name of ["recheckHelpers", "onHelpersBuildExited"]) {
    scope[name] = new Function("scope", "with(scope){" + functionBody(read("Service.qml"), name) + "; return " + name + "}")(scope)
  }
  scope.recheckHelpers()
  assert.deepEqual(seen.splice(0), ["vault", "unlock-key", "agent"])
  scope.onHelpersBuildExited()
  assert.deepEqual(seen.splice(0), ["vault", "unlock-key", "agent", "deps"])
  scope.vaultHelperState = "stopped"
  scope.recheckHelpers()
  assert.deepEqual(seen.splice(0), ["retry", "unlock-key", "agent"])
  scope.shuttingDown = true
  scope.onHelpersBuildExited()
  assert.deepEqual(seen, [])
})
