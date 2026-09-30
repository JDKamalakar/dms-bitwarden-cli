const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const source = fs.readFileSync(require("node:path").join(__dirname, "../Panel.qml"), "utf8");
const body = source.match(/function onScreenLockState\(\) \{([\s\S]*?)\n  \}/)[1];
const apply = new Function("root", "lockOnScreenLock", "status", "lockVault", body);
for (const locked of [true, false]) for (const enabled of [true, false]) {
  test(`DMS lock=${locked}, auto-lock=${enabled}`, () => {
    let calls = 0;
    apply({screenIsLocked: locked}, enabled, "unlocked", () => calls++);
    assert.equal(calls, locked && enabled ? 1 : 0);
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
