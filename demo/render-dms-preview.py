#!/usr/bin/env python3
"""Render a preview from real plugin controls with inert services and fixture data."""
from pathlib import Path
import re,shutil,json,subprocess,os,tempfile,argparse
repo=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--screen', choices=('vault', 'login'), default='vault')
parser.add_argument('--smoke-daemon', action='store_true', help='Load the complete daemon with disposable environment and failing CLI stubs')
parser.add_argument('--test-ui', action='store_true', help='Run bounded fields and approval UI tests with native DMS controls')
parser.add_argument('--check-controls', action='store_true', help='Exercise native inputs with disposable data')
parser.add_argument('--controls-style', choices=('Basic', 'Material'), default='Basic')
parser.add_argument('--check-layout', action='store_true', help='Check rendered header, action and filter bounds with fictional vault data')
parser.add_argument('--panel-width', type=int, choices=(450, 520), default=520)
parser.add_argument('--dms-dir', type=Path, help='Installed DMS shell directory providing native widgets')
parser.add_argument('--output', type=Path, default=repo/'docs/screenshots/dms-vault-preview.png')
args=parser.parse_args()
output=args.output.resolve()
output.parent.mkdir(parents=True, exist_ok=True)
workspace=tempfile.TemporaryDirectory(prefix='dms-bitwarden-preview-')
tmp=Path(workspace.name)
for p in repo.glob('*.qml'):
 if p.name not in ('BarWidget.qml','Settings.qml'):shutil.copy(p,tmp/p.name)
for p in repo.glob('*.js'): shutil.copy(p,tmp/p.name)
shutil.copytree(repo/'DmsUi',tmp/'DmsUi',dirs_exist_ok=True)
# Load the actual installed native controls; never start host services.
dms=args.dms_dir
if dms is None:
 candidates=sorted(Path('/run/user/'+str(os.getuid())+'/danklinux-shell').glob('*/DankCommon'),key=lambda p:p.stat().st_mtime,reverse=True)
 if not candidates: raise SystemExit('Pass --dms-dir pointing to the installed DMS shell directory')
 dms=candidates[0].parent
for sub in ('Widgets','DankCommon/Widgets'):
 shutil.copytree(dms/sub,tmp/sub,dirs_exist_ok=True)
common=tmp/'DankCommon/Common';common.mkdir(parents=True)
for name in ('Style','Appearance','Fonts','Anims','DankAnim','DankColorAnim'):
 shutil.copy(dms/'DankCommon/Common'/f'{name}.qml',common/f'{name}.qml')
(common/'I18n.qml').write_text('pragma Singleton\nimport QtQuick\nQtObject { readonly property bool isRtl: false }')
(common/'qmldir').write_text(''.join(f'singleton {n} 1.0 {n}.qml\n' for n in ('Style','Appearance','Fonts','Anims','I18n')) + 'DankAnim 1.0 DankAnim.qml\nDankColorAnim 1.0 DankColorAnim.qml\n')

# Locate QML blocks without treating braces in strings/comments as syntax.
tokens=re.compile(r'//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[{}]')
def endblock(s,start):
 depth=0
 for m in tokens.finditer(s,start):
  if m.group()=='{':depth+=1
  elif m.group()=='}':
   depth-=1
   if depth==0:return m.end()
 raise ValueError('unbalanced QML')
if not args.smoke_daemon:
 s=(tmp/'Service.qml').read_text()
 for pattern in [r'^  (?:Process|VaultProcess|Timer|PamContext|IpcHandler|SshApprovalPopup|LidState) \{',r'^  Component\.on(?:Completed|Destruction): \{']:
  while m:=re.search(pattern,s,re.M):
   end=endblock(s,s.index('{',m.start()));block=s[m.start():end]
   ident=re.search(r'\bid: (\w+)',block)
   replacement=''
   if ident:
    replacement='  QtObject { id: '+ident[1]+'''; property bool running: false; property bool active: false; property bool stdinEnabled: false; property var command: []; property var environment: ({}); property int interval: 0; function start() {} function stop() {} function restart() {} function write(value) {} function abort() {} }'''
   s=s[:m.start()]+replacement+s[end:]
 s=s.replace('Quickshell.execDetached','root.demoNoop')
 s=s.replace('import Quickshell.Services.Pam\n', '')
 s=s.replace('  id: root','  id: root\n  function demoNoop(value) {}',1)
 (tmp/'Service.qml').write_text(s)
(tmp/'SshApprovalPopup.qml').write_text('import QtQuick\nItem { property var panel; property var vault; property Item anchorItem; readonly property bool open: false; property var unlockScreen: null; function refocus() {} }')
# Isolate service imports; only data/geometry used by the actual controls remain.
(tmp/'Common').mkdir(exist_ok=True);(tmp/'Services').mkdir(exist_ok=True)
(tmp/'Common/qmldir').write_text('singleton Theme 1.0 Theme.qml\nsingleton SettingsData 1.0 SettingsData.qml\nsingleton I18n 1.0 I18n.qml\n')
(tmp/'Common/Theme.qml').write_text('''pragma Singleton
import QtQuick
QtObject {
 readonly property color primary: "#cbb7ff"
 readonly property color surface: "#141219"
 readonly property color surfaceText: "#e9e0f1"
 readonly property color surfaceContainer: "#201c28"
 readonly property color surfaceContainerHigh: "#302939"
 readonly property color outline: "#53495f"
 readonly property color error: "#ffb4ab"
 readonly property string fontFamily: "JetBrainsMono Nerd Font"
 readonly property real cornerRadius: 16
 readonly property real spacingM: 12
 readonly property real spacingL: 16
 readonly property real spacingS: 8
 readonly property real fontSizeMedium: 14
 readonly property real fontSizeSmall: 12
 readonly property real fontSizeLarge: 16
 readonly property real fontSizeXLarge: 20
 readonly property real iconSize: 20
 function withAlpha(c,a) { return Qt.rgba(c.r,c.g,c.b,a); }
}''')
(tmp/'Common/SettingsData.qml').write_text('''pragma Singleton
import QtQuick
QtObject { function getPluginSettingsForPlugin(id) { return {autoLockMinutes:0,rememberSession:false,suggestOnOpen:false}; } }''')
(tmp/'Common/I18n.qml').write_text('''pragma Singleton
import QtQuick
QtObject { function trFor(id,term,context) { return term; } }''')
(tmp/'Services/qmldir').write_text('singleton IdleService 1.0 IdleService.qml\nsingleton BarWidgetService 1.0 BarWidgetService.qml\n')
(tmp/'Services/IdleService.qml').write_text('''pragma Singleton
import QtQuick
QtObject { property bool isShellLocked: false }''')
(tmp/'Services/BarWidgetService.qml').write_text('''pragma Singleton
import QtQuick
QtObject { function getWidgetOnFocusedScreen(id) { return null; } }''')
(tmp/'DmsUi/KeyboardPanel.qml').write_text('''import QtQuick
import qs.Common
Rectangle {
 property Item anchorItem
 property var bar
 property var owner
 property bool open
 property Item focusTarget
 property real contentWidth: 450
 property real contentHeight: 640
 default property alias contentData: holder.data
 width: contentWidth + 32; height: contentHeight + 32
 color: Theme.surfaceContainer; radius: 20
 border.color: Theme.outline; border.width: 1
 function fittedContentWidth(value) {return Math.min(value, 520);}
 function fittedContentHeight(value,maximum) {return Math.min(value, maximum || value, 640);}
 function setTriggerPosition() {}
 function refocus() {}
 Item { id: holder; anchors.fill: parent; anchors.margins: 16 }
}''')
panel_stub = tmp/'DmsUi/KeyboardPanel.qml'
panel_stub.write_text(panel_stub.read_text().replace('Math.min(value, 520)', f'Math.min(value, {args.panel_width})'))
for component in (tmp/'DmsUi').glob('*.qml'):
 if component.stem not in ['Style','DmsColor','Border','Util','Tr']:
  with (tmp/'DmsUi/qmldir').open('a') as f:f.write(f'{component.stem} 1.0 {component.name}\n')
fixture=json.loads((repo/'demo/fixtures.json').read_text())
fixture['items']=[x for x in fixture['items'] if x.get('name') in ['GitHub','Home Assistant','Acme Grafana','Acme VPN','Dana Demo','Demo Card']]
(tmp/'Fixture.js').write_text('var data = '+json.dumps(fixture)+';')
(tmp/'shell.qml').write_text('''import QtQuick
import QtQuick.Window
import Quickshell
import "BitwardenModel.js" as Model
import "Fixture.js" as Fixture
Window {
 id: window; visible: true; width: 1280; height: 840; color: "#100e15"
 Item { id: canvas; anchors.fill: parent
 Rectangle { anchors.fill: parent; gradient: Gradient { GradientStop { position: 0; color: "#211a30" } GradientStop { position: 1; color: "#100e15" } } }
 Column { x: 64; y: 88; width: 540; spacing: 20
 Text { text: "DANKMATERIALSHELL PLUGIN"; color: "#cbb7ff"; font.family: "Inter"; font.pixelSize: 16; font.letterSpacing: 3 }
 Text { text: "Bitwarden\\nDankbar"; color: "#f4effa"; font.family: "Inter"; font.pixelSize: 56; font.weight: Font.DemiBold; lineHeight: 1.05 }
 Text { text: "Your vault, right in your bar."; color: "#c8bfd4"; font.family: "Inter"; font.pixelSize: 23 }
 Rectangle { width: 68; height: 3; radius: 2; color: "#cbb7ff" }
 Text { text: "Search. Copy. Stay in flow."; color: "#e9e0f1"; font.family: "Inter"; font.pixelSize: 23 }
 Text { text: "Bitwarden + Vaultwarden\\nFingerprint & PIN unlock\\nEnglish + Deutsch"; color: "#b9adc9"; font.family: "Inter"; font.pixelSize: 19; lineHeight: 1.65 }
 }
 Service { id: service
 Component.onCompleted: {
  status = "unlocked"; session = ""; userEmail = "demo@example.com";
  folders = Fixture.data.folders; items = Model.parseItems(JSON.stringify(Fixture.data.items));
  cursorActive = true; currentScreen = "main"; isLoading = false; isSyncing = false; accountsLoaded = true;
  refreshDerivedFromItems();
 }
 }
 Panel { id: previewPanel; x: 660; y: 64; vault: service; opened: true }
 Text { x: 64; y: 812; text: "OFFICIAL BITWARDEN CLI  /  OPEN SOURCE"; color: "#91869e"; font.family: "Inter"; font.pixelSize: 13; font.letterSpacing: 1.8 }
 Text { x: 660; y: 784; text: "Demo vault • No real credentials"; color: "#91869e"; font.family: "Inter"; font.pixelSize: 14 }
 }
 Timer { interval: 1500; running: true; onTriggered: { canvas.grabToImage(function(result) {result.saveToFile("/tmp/bitwarden-dankbar-preview.png"); Qt.quit();}) } }
}''')
shell=tmp/'shell.qml'
if args.screen == 'login':
 shell.write_text(shell.read_text().replace('status = "unlocked";', 'status = "unauthenticated";'))
shell.write_text(shell.read_text().replace(chr(34)+'/tmp/bitwarden-dankbar-preview.png'+chr(34),json.dumps(str(output))))
if args.check_layout:
 shutil.copy(repo/'demo/check-vault-layout.js', tmp/'CheckVaultLayout.js')
 shell.write_text(shell.read_text().replace('import Quickshell\n', 'import Quickshell\nimport "CheckVaultLayout.js" as LayoutChecks\n', 1).replace('canvas.grabToImage(function', 'LayoutChecks.verify(previewPanel); canvas.grabToImage(function', 1))
if args.smoke_daemon:
 daemon=tmp/'Daemon.qml'
 daemon.write_text(daemon.read_text().replace('id: root', 'id: root\n    readonly property var testService: service',1))
 shell.write_text('''import QtQuick
import QtQuick.Window
import Quickshell
Window {
 visible: true; width: 640; height: 800
 Daemon { id: daemon }
 Timer { interval: 2500; running: true; onTriggered: {
   if (!daemon.testService.live || !daemon.testService.started) throw new Error("service did not start")
   if (daemon.testService.session !== "" || daemon.testService.vaultHelperState !== "stopped") throw new Error("missing helper did not fail closed")
   console.warn("DMS_DAEMON_SMOKE_OK")
   Qt.quit()
 } }
}
''')
env=dict(os.environ,QT_QPA_PLATFORM='offscreen',QT_QUICK_BACKEND='software',USER='demo',LOGNAME='demo',HOME=str(tmp),XDG_CONFIG_HOME=str(tmp/'config'),XDG_DATA_HOME=str(tmp/'data'),XDG_STATE_HOME=str(tmp/'state'))
env.pop('WAYLAND_DISPLAY',None)
env.pop('DISPLAY',None)
env.pop('DBUS_SESSION_BUS_ADDRESS',None)
env['XDG_RUNTIME_DIR']=str(tmp/'runtime')
(tmp/'runtime').mkdir(mode=0o700)
env['PATH']='/nonexistent'
if args.smoke_daemon:
 stubs=tmp/'stubs';stubs.mkdir()
 for name in ['setsid','bash','bw','secret-tool','wl-copy','wl-paste','pinentry','pinentry-qt','systemd-inhibit','systemd-creds','notify-send','dms']:
  f=stubs/name;f.write_text('#!/bin/sh\nexit 1\n');f.chmod(0o700)
 env['PATH']=str(stubs)
env['QT_QPA_PLATFORMTHEME']=''
env['QT_QUICK_CONTROLS_STYLE']=args.controls_style
if args.check_controls or args.test_ui:
 # QtTest runs the real controls without Quickshell's host module loader.
 (tmp/'qs').symlink_to(tmp, target_is_directory=True)
 for folder in ('Widgets','DankCommon/Widgets'):
  (tmp/folder).chmod(0o700)
  if (tmp/folder/'qmldir').exists(): (tmp/folder/'qmldir').chmod(0o600)
  (tmp/folder/'qmldir').write_text('module qs.'+folder.replace('/','.')+'\n'+''.join(f'{f.stem} 1.0 {f.name}\n' for f in (tmp/folder).glob('*.qml')))
 for folder in ('Common','DankCommon/Common'):
  directory=tmp/folder/'qmldir'
  directory.write_text('module qs.'+folder.replace('/','.')+'\n'+directory.read_text())
 for name in ('Style','Appearance','Fonts','Anims'):
  file=common/f'{name}.qml'
  file.chmod(0o600)
  file.write_text(file.read_text().replace('import Quickshell', '').replace('Singleton {','Item {'))
 if args.test_ui:
  shutil.copytree(repo/'tests/qml-kit',tmp/'tests/qml-kit')
 else:
  shutil.copy(repo/'demo/check-dms-controls.qml',tmp/'tst_controls.qml')
 # Inert process objects let QtTest exercise asynchronous paste cancellation.
 subprocess.run(['node',str(repo/'tests/qml-kit/kit-imports.js'),str(dms),str(tmp)],check=True)
 runner=shutil.which('qmltestrunner') or '/usr/lib/qt6/bin/qmltestrunner'
 checks=subprocess.run([runner,'-import',str(tmp),'-input',str(tmp/'tests/qml-kit' if args.test_ui else tmp/'tst_controls.qml'),'-o','-,txt'],env=env,capture_output=True,text=True,timeout=20)
 if checks.returncode or 'FAIL!' in checks.stdout+checks.stderr:
  raise SystemExit(checks.stdout+checks.stderr)
 print(checks.stdout)
 raise SystemExit(0)
try:
 r=subprocess.run([shutil.which('qs'),'-p',str(tmp/'shell.qml')],env=env,capture_output=True,text=True,timeout=20)
except subprocess.TimeoutExpired as error:
 raise SystemExit((error.stdout or b'').decode(errors='replace')+(error.stderr or b'').decode(errors='replace'))
workspace.cleanup()
if r.returncode or re.search(r'ERROR:|ReferenceError:|TypeError:|Cannot assign|Binding loop', r.stdout+r.stderr) or ("DMS_DAEMON_SMOKE_OK" not in r.stdout+r.stderr if args.smoke_daemon else not output.is_file()):
 raise SystemExit(r.stdout+r.stderr)
print("DMS daemon smoke passed" if args.smoke_daemon else output)
