import QtQuick
import qs.Widgets as DmsWidgets
import "."

// Preserve the panel's input API while DMS owns rendering and text editing.
FocusScope {
    id: root
    property alias text: field.text
    property alias placeholderText: field.placeholderText
    property alias font: field.font
    property alias echoMode: field.echoMode
    property alias validator: field.validator
    property alias maximumLength: field.maximumLength
    property alias cursorPosition: field.cursorPosition
    property color foreground: DmsColor.foreground
    property color accent: DmsColor.accent
    property bool password: false
    property bool hasCursor: false
    signal accepted()
    signal editingFinished()
    signal textEdited()
    implicitWidth: Style.space(200)
    implicitHeight: Style.spacing.controlHeight
    function selectAll() { field.selectAll() }
    function clear() { field.clear() }
    onActiveFocusChanged: if (activeFocus && !field.getActiveFocus()) field.forceActiveFocus()
    DmsWidgets.DankTextField {
        id: field
        anchors.fill: parent
        focus: true
        textColor: root.foreground
        focusedBorderColor: root.accent
        echoMode: root.password ? TextInput.Password : TextInput.Normal
        hidePlaceholderOnFocus: false
        keyForwardTargets: [root]
        onAccepted: root.accepted()
        onEditingFinished: root.editingFinished()
        onTextEdited: root.textEdited()
    }
}
