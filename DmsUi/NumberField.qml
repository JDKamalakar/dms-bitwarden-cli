import QtQuick
import "."

Column {
    id: root
    property string label: ""
    property int value: 0
    property int from: 0
    property int to: 100
    property int stepSize: 1
    property color foreground: Color.foreground
    property color accent: Color.accent
    property string fontFamily: Style.font.family
    property real fontSize: Style.font.body
    property real fieldWidth: Style.spacing.numberFieldWidth
    property bool hasCursor: false
    property alias field: input
    signal modified(int value)
    signal hovered(bool on)
    spacing: Style.spacing.md
    function commit(text) {
        var parsed = Number(text)
        if (String(text).trim() !== "" && isFinite(parsed))
            root.modified(Math.max(root.from, Math.min(root.to, Math.round(parsed))))
        input.text = String(root.value)
    }
    onValueChanged: input.text = String(value)
    Text {
        text: root.label
        textFormat: Text.PlainText
        visible: text !== ""
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
    }
    Row {
        width: root.fieldWidth
        spacing: Style.space(2)
        Button {
            text: "−"
            width: Style.space(26)
            height: input.height
            horizontalPadding: 0
            enabled: root.value > root.from
            focusable: true
            onClicked: root.modified(Math.max(root.from, root.value - root.stepSize))
        }
        TextField {
            id: input
            width: parent.width - Style.space(56)
            text: String(root.value)
            foreground: root.foreground
            accent: root.accent
            validator: IntValidator { bottom: root.from; top: root.to }
            onEditingFinished: root.commit(text)
            Keys.onUpPressed: root.modified(Math.min(root.to, root.value + root.stepSize))
            Keys.onDownPressed: root.modified(Math.max(root.from, root.value - root.stepSize))
        }
        Button {
            text: "+"
            width: Style.space(26)
            height: input.height
            horizontalPadding: 0
            enabled: root.value < root.to
            focusable: true
            onClicked: root.modified(Math.min(root.to, root.value + root.stepSize))
        }
    }
    HoverHandler { onHoveredChanged: root.hovered(hovered) }
}
