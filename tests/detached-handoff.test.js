const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {test} = require('node:test');

const repo = path.join(__dirname, '..');
const panel = fs.readFileSync(path.join(repo, 'Service.qml'), 'utf8');

test('detached clipboard and lock handoffs work in Quickshell without secrets in argv', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-handoff-test-'));
    const secret = 'fixture-only \' " $() ; \\ newline\nGrüße 🔐';
    const session = 'fixture-only-session-key';
    try {
        fs.copyFileSync(path.join(repo, 'BitwardenModel.js'), path.join(dir, 'BitwardenModel.js'));
        // Stand-ins record the actual bytes and parent argv. No desktop clipboard,
        // keyring or Bitwarden account is accessed by this test.
        const stub = `#!/usr/bin/python3
import os,sys,json,pathlib
kind = pathlib.Path(sys.argv[0]).name
record = {'argv': sys.argv, 'session': os.getenv('BW_SESSION'), 'clip_env': os.getenv('QSBW_CLIP')}
if kind == 'wl-copy': record['input'] = sys.stdin.read()
chain=[]
pid=os.getpid()
for _ in range(4):
 try:
  chain.append(pathlib.Path('/proc',str(pid),'cmdline').read_bytes().decode(errors='replace'))
  pid=int(pathlib.Path('/proc',str(pid),'stat').read_text().rsplit(')',1)[1].split()[1])
 except (OSError,ValueError): break
record['process_chain']=chain
pathlib.Path(${JSON.stringify(dir)},kind+'.json').write_text(json.dumps(record))
`;
        for (const binary of ['bw', 'wl-copy']) fs.writeFileSync(path.join(dir, binary), stub, {mode: 0o700});
        const {functionBody} = require('./harness');
        const copy = functionBody(panel, 'copyToClipboard');
        const detach = functionBody(panel, 'detachWithEnvironment');
        const revoke = functionBody(panel, 'lockSessionOnUnload');
        const qml = `import QtQuick
import Quickshell
import Quickshell.Io
import "BitwardenModel.js" as Model
ShellRoot {
 id: root
 property string session: ${JSON.stringify(session)}
 property int clearClipboardSec: 0
 function bwEnv() { return {BW_SESSION: session}; }
 function resetAutoLockTimer() {}
 function flashNotification(label) {}
 property bool rememberSession: false
 property bool vaultHelperActive: false
 Component { id: detachedProcessFactory; Process {} }
 ${detach}
 ${revoke}
 ${copy}
 Component.onCompleted: {
  copyToClipboard(${JSON.stringify(secret)}, "fixture");

 }
 Component.onDestruction: {
  lockSessionOnUnload();
 }
 Timer { running: true; interval: 700; onTriggered: Qt.quit(); }
}`;
        fs.writeFileSync(path.join(dir, 'shell.qml'), qml);
        const env = {...process.env, PATH: dir + ':' + process.env.PATH, QT_QPA_PLATFORM: 'offscreen', QT_QPA_PLATFORMTHEME: '', QT_QUICK_CONTROLS_STYLE: 'Basic'};
        delete env.WAYLAND_DISPLAY;
        delete env.DISPLAY;
        const logs = execFileSync('qs', ['-p', path.join(dir, 'shell.qml')], {env, encoding:'utf8', timeout:10000, stdio:['ignore','pipe','pipe']});
        assert.doesNotMatch(logs, /ERROR:|ReferenceError|TypeError/);
        const deadline = Date.now() + 2000;
        while (!fs.existsSync(path.join(dir, 'bw.json')) && Date.now() < deadline) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
        }
        const clip = JSON.parse(fs.readFileSync(path.join(dir, 'wl-copy.json'), 'utf8'));
        const lock = JSON.parse(fs.readFileSync(path.join(dir, 'bw.json'), 'utf8'));
        assert.equal(clip.input, secret);
        assert.equal(clip.clip_env, null, 'long-lived clipboard owner must not inherit secret variable');
        assert.deepEqual(clip.argv.slice(1), ['--sensitive']);
        assert.equal(lock.session, session);
        assert.deepEqual(lock.argv.slice(1), ['lock']);
        for (const record of [clip, lock]) {
            for (const argv of record.process_chain) {
                assert.ok(!argv.includes(secret), 'clipboard secret exposed in process argv');
                assert.ok(!argv.includes(session), 'session exposed in process argv');
            }
        }
    } finally {
        fs.rmSync(dir, {recursive:true, force:true});
    }
});

test('complete Panel QML parses after the delegate layering change', () => {
    execFileSync('/usr/lib/qt6/bin/qmlformat', [path.join(repo, 'Service.qml')], {stdio:['ignore','ignore','pipe']});
});
