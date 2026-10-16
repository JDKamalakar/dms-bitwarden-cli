const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { test } = require("node:test")
const { loadModule, repoRoot } = require("./harness")
const Model = loadModule()
const hashScript = path.join(repoRoot, "scripts/helper-source-hash.sh")

function fixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-source ' $(touch INJECTED)-"))
  try { return run(dir) }
  finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

function crate(dir) {
  fs.mkdirSync(path.join(dir, "src"), { recursive: true })
  fs.writeFileSync(path.join(dir, "Cargo.toml"), "[package]\nname = 'fixture'\n")
  fs.writeFileSync(path.join(dir, "Cargo.lock"), "# lock\n")
  fs.writeFileSync(path.join(dir, "src/main.rs"), "fn main() {}\n")
}

function hash(dir, env = {}) {
  const result = spawnSync(hashScript, [dir], { encoding: "utf8", env: { ...process.env, ...env } })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim().length, 64)
  return result.stdout.trim()
}

test("source hashes are stable, ignore mtimes and locale, and include paths and all build inputs", () => fixture(dir => {
  crate(dir)
  const original = hash(dir)
  assert.equal(hash(dir), original)
  fs.utimesSync(path.join(dir, "src/main.rs"), 1, 1)
  assert.equal(hash(dir, { LC_ALL: "de_DE.UTF-8" }), original)
  for (const file of ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", ".cargo/config", ".cargo/config.toml", "build.rs", "src/main.rs", "src/nested/file with\nnewline.rs"]) {
    const full = path.join(dir, file)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    const before = hash(dir)
    const previous = fs.existsSync(full) ? fs.readFileSync(full) : null
    fs.appendFileSync(full, "# changed\n")
    assert.notEqual(hash(dir), before, file)
    if (previous) fs.writeFileSync(full, previous)
    else fs.unlinkSync(full)
    assert.equal(hash(dir), before)
  }
  fs.renameSync(path.join(dir, "src/main.rs"), path.join(dir, "src/renamed.rs"))
  assert.notEqual(hash(dir), original)
  fs.mkdirSync(path.join(dir, "target"))
  const renamed = hash(dir)
  fs.writeFileSync(path.join(dir, "target/ignored"), "not an input")
  assert.equal(hash(dir), renamed)
}))

test("hashing rejects invalid crates and symlinked inputs rather than reading outside the crate", () => fixture(dir => {
  crate(dir)
  for (const invalid of [path.join(dir, "absent"), path.join(dir, "Cargo.toml")]) {
    assert.notEqual(spawnSync(hashScript, [invalid]).status, 0)
  }
  assert.notEqual(spawnSync(hashScript, []).status, 0)
  for (const input of ["src/link", "Cargo.lock", ".cargo", "src"]) {
    const full = path.join(dir, input)
    fs.rmSync(full, { recursive: true, force: true })
    fs.symlinkSync("/etc", full)
    assert.notEqual(spawnSync(hashScript, [dir]).status, 0, input)
    fs.unlinkSync(full)
    crate(dir)
  }
}))

test("build script stamps each crate only after a successful self-test", () => fixture(dir => {
  const scripts = path.join(dir, "scripts")
  const bin = path.join(dir, "bin")
  fs.mkdirSync(scripts)
  fs.mkdirSync(bin)
  for (const script of ["build-helpers.sh", "helper-source-hash.sh"]) {
    fs.copyFileSync(path.join(repoRoot, "scripts", script), path.join(scripts, script))
  }
  const names = { vault: "qs-bitwarden-vault", "unlock-key": "qs-bitwarden-unlock-key", agent: "qs-bitwarden-ssh-agent" }
  for (const name of Object.keys(names)) crate(path.join(dir, name))
  const helper = path.join(dir, "stub-helper")
  fs.writeFileSync(helper, '#!/bin/bash\n[[ "$1" == --self-test ]] || exit 9\n[[ ! -e "$0.source-sha256" ]] || exit 8\ncase "$0" in "$FAIL_CRATE/"*) exit 7;; esac\n', { mode: 0o755 })
  fs.writeFileSync(path.join(bin, "cargo"), '#!/bin/bash\n[[ "$*" == "build --locked" ]] || exit 9\ncase "${PWD##*/}" in\nvault) name=qs-bitwarden-vault;;\nunlock-key) name=qs-bitwarden-unlock-key;;\nagent) name=qs-bitwarden-ssh-agent;;\nesac\nmkdir -p target/debug\ncp "$STUB_HELPER" "target/debug/$name"\n', { mode: 0o755 })
  const build = fail => spawnSync(path.join(scripts, "build-helpers.sh"), [], {
    encoding: "utf8", env: { ...process.env, PATH: bin + ":" + process.env.PATH, STUB_HELPER: helper, FAIL_CRATE: fail }
  })
  const stamp = name => path.join(dir, name, "target/debug", names[name] + ".source-sha256")
  const failed = build("unlock-key")
  assert.equal(failed.status, 7, failed.stderr)
  assert.equal(fs.readFileSync(stamp("vault"), "utf8").trim(), hash(path.join(dir, "vault")))
  assert.equal(fs.existsSync(stamp("unlock-key")), false)
  assert.equal(fs.existsSync(stamp("agent")), false)
  fs.unlinkSync(stamp("vault"))
  fs.chmodSync(path.join(scripts, "helper-source-hash.sh"), 0o644)
  const passed = build("")
  assert.equal(passed.status, 0, passed.stderr)
  for (const name of Object.keys(names)) {
    assert.equal(fs.readFileSync(stamp(name), "utf8").trim(), hash(path.join(dir, name)))
  }
}))

test("real inspections report match, mismatch and missing without rejecting a working helper", () => fixture(dir => {
  fs.mkdirSync(path.join(dir, "scripts"))
  fs.copyFileSync(hashScript, path.join(dir, "scripts/helper-source-hash.sh"))
  for (const [name, spec, command, parse] of [
    ["vault", Model.VAULT_HELPER_SPEC, Model.vaultHelperInspectCommand, Model.parseVaultHelperInspection],
    ["unlock-key", Model.UNLOCK_KEY_SPEC, Model.unlockKeyInspectCommand, Model.parseUnlockKeyInspection],
    ["agent", Model.SSH_AGENT_HELPER_SPEC, Model.sshAgentHelperInspectCommand, Model.parseSshAgentHelperInspection]
  ]) {
    const root = path.join(dir, name)
    crate(root)
    const binary = path.join(dir, spec.development)
    fs.mkdirSync(path.dirname(binary), { recursive: true })
    fs.copyFileSync(path.join(repoRoot, spec.development), binary)
    const inspect = expected => {
      const cmd = command(dir)
      const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 10000, cwd: dir })
      assert.equal(result.status, 0, result.stderr)
      const helper = parse(result.stdout)
      assert.equal(helper.state, "ok", result.stdout)
      assert.equal(helper.sourceStamp, expected, result.stdout)
      assert.equal(helper.sourceHash, hash(root), result.stdout)
    }
    inspect("missing")
    fs.writeFileSync(binary + ".source-sha256", hash(root) + "\n")
    inspect("match")
    fs.appendFileSync(path.join(root, "src/main.rs"), "// update\n")
    inspect("mismatch")
    fs.unlinkSync(binary + ".source-sha256")
    inspect("missing")
    assert.equal(fs.existsSync(path.join(dir, "INJECTED")), false)
  }
  for (const invalid of ["relative", "/tmp/../invalid"]) {
    const cmd = Model.vaultHelperInspectCommand(invalid)
    assert.equal(spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8" }).stdout.trim(), "state=missing")
  }
}))
