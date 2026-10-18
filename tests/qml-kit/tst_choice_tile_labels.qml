// Real approval/unlock rows with native DMS buttons and the preview's 12 px font.
// Run with tests/qml-kit/run.sh --dms-dir /path/to/DankMaterialShell/quickshell.
pragma ComponentBehavior: Bound
import QtQuick
import QtTest
import "../.."
import "../../DmsUi"
import "../../BitwardenModel.js" as Model

TestCase {
  id: tc
  name: "ChoiceTileLabels"
  when: windowShown
  width: 500; height: 800
  visible: true

  QtObject {
    id: fakePanel
    property string fontFamily: "monospace"
    property color fg: "white"
    property color dim: "gray"
    property color urgent: "red"
  }

  QtObject {
    id: fakeVault
    property string activeScreen: "sshApproval"
    property string status: "locked"
    property bool sshAgentApprovalPopup: true
    property bool sshAgentLoadActive: false
    property int sshPendingCount: 1
    property int sshPromptRemainingSec: 120
    property var sshPrompt: null
    property string userEmail: ""
    property bool fidoReady: true
    property bool fingerprintReady: true
    property bool pinReady: true
    property bool fidoScanning: false
    property bool fidoAuthorized: false
    property bool fingerprintScanning: false
    property bool isUnlocking: false
    property string pendingUnlockFrom: ""
    property bool pinBusy: false
    property string fidoMessage: ""
    property string fingerprintMessage: ""
    property string fidoError: ""
    property string fingerprintError: ""
    property bool fingerprintUnlock: false
    property bool fingerprintAvailable: true
    property bool fingerprintStored: true
    property string pinUnlockError: ""
    property string typedSecretEntry: "field"
    property string pinEntry: ""
    property string masterPassword: ""
    function releaseFidoUnlock() {}
    function cancelFingerprintUnlock() {}
    function startFidoUnlock() {}
    function startFingerprintUnlock() {}
  }

  Item { id: host; width: tc.width; height: tc.height }
  Component { id: approval; SshApprovalScreen { panel: fakePanel; vault: fakeVault } }
  Component { id: unlock; UnlockForm { panel: fakePanel; vault: fakeVault } }
  property var screen: null
  property string longestTimedLabel: ""
  property int longestTimedSeconds: 0

  TextMetrics { id: metrics; font.family: fakePanel.fontFamily; font.pixelSize: Style.font.caption }
  Text { id: wrapped; visible: false; textFormat: Text.PlainText; wrapMode: Text.WordWrap }

  function initTestCase() {
    var widest = -1
    for (var seconds = 1; seconds <= Model.SSH_AGENT_APPROVAL_WINDOW_MAX_SEC; seconds++) {
      metrics.text = Model.sshAgentPromptView({grantOffered: true}, seconds, false).grantShortLabel
      if (metrics.width > widest) {
        widest = metrics.width
        longestTimedLabel = metrics.text
        longestTimedSeconds = seconds
      }
    }
    verify(longestTimedLabel.length > "Approve 15m".length)
  }

  function cleanup() {
    if (screen) screen.destroy()
    screen = null
    wait(0)
  }

  function descendants(item, predicate) {
    var found = []
    for (var i = 0; i < item.children.length; i++) {
      var child = item.children[i]
      if (predicate(child)) found.push(child)
      found = found.concat(descendants(child, predicate))
    }
    return found
  }

  function tiles() {
    return descendants(screen, function(item) {
      return item.visible && item.label !== undefined && item.glyph !== undefined
    })
  }

  function localize(choices, language) {
    // The preview's I18n is an identity stub. These are the current de.json labels;
    // Deny, Fingerprint, FIDO2 Key, PIN and timed grantShortLabel are not translated.
    var german = {
      "Approve until screen lock": "Bis zur Bildschirmsperre erlauben",
      "Approve once": "Einmal erlauben",
      "Deny all (4)": "Alle ablehnen (4)",
      "Password": "Passwort"
    }
    if (language === "de") choices.forEach(function(tile) {
      if (german[tile.label]) tile.label = german[tile.label]
    })
  }

  function checkCaptions(choices) {
    var tallest = 0
    choices.forEach(function(tile) {
      var labels = descendants(tile, function(item) {
        return item.text === tile.label && item.font !== undefined
          && item.font.pixelSize === Style.font.caption
      })
      compare(labels.length, 1, "caption for " + tile.label)
      var caption = labels[0]
      verify(!caption.truncated, tile.label + " is elided at " + caption.width + " px")
      verify(caption.lineCount <= 3, tile.label + " exceeds three lines")
      verify(caption.contentWidth <= caption.width + 0.01, tile.label + " overflows its caption box")
      compare(caption.horizontalAlignment, Text.AlignHCenter)
      compare(caption.font.pixelSize, Style.font.caption, "do not shrink the font")
      wrapped.width = caption.width
      wrapped.font = caption.font
      wrapped.text = caption.text
      verify(wrapped.lineCount <= 3, tile.label + " needs more than three lines")
      verify(wrapped.contentWidth <= wrapped.width + 0.01, tile.label + " has a word wider than its box")
      compare(caption.lineCount, wrapped.lineCount, "caption must wrap at word boundaries")
      tallest = Math.max(tallest, caption.parent.implicitHeight + Style.space(12))
    })
    choices.forEach(function(tile) {
      compare(tile.height, tallest, "all tiles must match the tallest caption")
    })
  }

  function approvalData() {
    var rows = []
    ;["en", "de"].forEach(function(language) {
      ;[3, 4].forEach(function(count) {
        ;["lock", "timed"].forEach(function(mode) {
          rows.push({tag: language + "-" + count + "-" + mode, language: language, count: count, mode: mode})
        })
      })
    })
    return rows
  }

  function openApproval(data) {
    fakeVault.sshPendingCount = data.count === 4 ? 4 : 1
    fakeVault.sshPrompt = Model.sshAgentPromptView({grantOffered: true}, longestTimedSeconds, data.mode === "lock")
    // SshApprovalPopup's 460 px card, 12 px padding and 2 px border per side.
    var rowWidth = Style.space(460) - 2 * (Style.spacing.panelPadding + Math.max(1, Style.space(2)))
    screen = approval.createObject(host, {width: rowWidth})
    verify(screen !== null)
    wait(0)
    var choices = tiles()
    compare(choices.length, data.count)
    localize(choices, data.language)
    wait(0)
    return choices
  }

  function test_approvalCaptions_data() { return approvalData() }
  function test_approvalCaptions(data) {
    var choices = openApproval(data)
    if (data.mode === "timed") compare(choices[choices.length - 1].label, longestTimedLabel)
    checkCaptions(choices)
  }

  function test_approvalLayout_data() { return approvalData() }
  function test_approvalLayout(data) {
    var choices = openApproval(data)
    var columns = data.count === 4 ? 2 : data.count
    var tileWidth = (screen.width - Style.space(6) * (columns - 1)) / columns
    choices.forEach(function(tile, index) {
      fuzzyCompare(tile.width, tileWidth, 0.01, "equal-width tiles")
      fuzzyCompare(tile.x, (index % columns) * (tileWidth + Style.space(6)), 0.01)
      fuzzyCompare(tile.y, Math.floor(index / columns) * (choices[0].height + Style.space(6)), 0.01)
    })
  }

  function test_fourTileFocus_data() { return [{tag: "en", language: "en"}, {tag: "de", language: "de"}] }
  function test_fourTileFocus(data) {
    var choices = openApproval({language: data.language, count: 4, mode: "lock"})
    tryVerify(function() { return screen.armed }, 2000)
    compare(screen.Window.activeFocusItem, choices[0], "Deny is initially focused")
    for (var i = 1; i < choices.length; i++) {
      keyClick(Qt.Key_Tab)
      compare(screen.Window.activeFocusItem, choices[i], "Tab follows decision order")
    }
  }

  function test_unlockCaptions_data() { return [{tag: "en", language: "en"}, {tag: "de", language: "de"}] }
  function test_unlockCaptions(data) {
    // Panel.qml's contentWidth is 450 px, also the unlock-method row width.
    screen = unlock.createObject(host, {width: Style.space(450)})
    verify(screen !== null)
    wait(0)
    var choices = tiles()
    compare(choices.map(function(tile) { return tile.label }).join(","), "FIDO2 Key,Fingerprint,PIN,Password")
    localize(choices, data.language)
    wait(0)
    checkCaptions(choices)
    choices.forEach(function(tile) { fuzzyCompare(tile.width, (screen.width - Style.space(18)) / 4, 0.01) })
  }
}
