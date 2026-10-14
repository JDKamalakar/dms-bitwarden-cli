const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const source = fs.readFileSync(require("node:path").join(__dirname, "../Service.qml"), "utf8");
const body = source.match(/function onScreenLockState\(raw\) \{([\s\S]*?)\n  \}/)[1];
const apply = new Function("root", "lockOnScreenLock", "status", "lockVault", "sshAgentProc", "revokeAllSshGrants", body);
for (const enabled of [true, false]) for (const running of [true, false]) {
  test(`DMS screen lock, auto-lock=${enabled}, helper=${running}`, () => {
    const calls = [];
    apply({screenIsLocked: true}, enabled, "unlocked", () => calls.push("lock"),
      {running}, () => calls.push("revoke"));
    assert.deepEqual(calls, [
      ...(running ? ["revoke"] : []),
      ...(enabled ? ["lock"] : [])
    ]);
  });
}
test("SSH authorization reads the live DMS state without stale polling", () => {
  const body = source.match(/function sshAgentMayPrompt\(\) \{([\s\S]*?)\n  \}/)[1];
  const check = new Function("IdleService", "Model", "root", body);
  const model = {sshAgentShouldPrompt: c => c.screenLocked === false, sshAgentCooldownActive: () => false};
  assert.equal(check({isShellLocked:true}, model, {}), false);
  assert.equal(check({isShellLocked:false}, model, {}), true);
  assert.doesNotMatch(source, /screenLockPoll|screenLockStateProc|screenLockCheckedAt/);
  assert.match(source, /readonly property bool screenIsLocked: IdleService.isShellLocked/);
});
