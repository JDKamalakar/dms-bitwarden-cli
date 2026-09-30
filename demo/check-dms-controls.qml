import QtQuick
import QtTest
import "DmsUi" as Ui

Item {
    id: checks
    property int clicks: 0
    property int accepted: 0
    property int downs: 0
    property int escapes: 0
    property bool toggled: false
    width: 600; height: 200
    Ui.Button { id: button; width: 100; height: 40; text: "Demo"; onClicked: checks.clicks++ }
    Ui.TextField {
        id: field; y: 45; width: 240; password: true
        onAccepted: checks.accepted++
        Keys.onDownPressed: checks.downs++
        Keys.onEscapePressed: checks.escapes++
    }
    Ui.ToggleSwitch { id: toggle; x: 280; y: 45; checked: checks.toggled; onToggled: checks.toggled = !checks.toggled }
    Ui.NumberField { id: number; y: 110; value: 2; from: 1; to: 5; onModified: function(value) { number.value = value } }
    TestCase {
        id: driver
        when: windowShown
        name: "NativeDmsControls"
        function test_controls() {
            function require(ok, label) { if (!ok) throw new Error(label) }
            mouseClick(button, 50, 20)
            require(checks.clicks === 1, "native button click")
            field.forceActiveFocus()
            wait(40)
            require(field.activeFocus, "text field focus scope")
            keyClick(Qt.Key_A)
            require(field.text === "a", "native text editing")
            require(field.echoMode === TextInput.Password, "password masked")
            keyClick(Qt.Key_Return)
            require(checks.accepted === 1, "accepted signal")
            keyClick(Qt.Key_Down)
            require(checks.downs === 1, "search arrow routing")
            keyClick(Qt.Key_Escape)
            require(checks.escapes === 1, "escape routing")
            mouseClick(toggle, toggle.width/2, toggle.height/2)
            require(checks.toggled, "native toggle click")
            number.commit("100")
            require(number.value === 5, "number clamp")
            console.log("DMS_CONTROLS_PASS")
        }
    }
}
