import QtQuick
import "DmsUi"

// PanelSectionHeader in the bar's foreground and font.
PanelSectionHeader {
  required property var panel
  textFormat: Text.PlainText
  foreground: panel.fg
  fontFamily: panel.fontFamily
}
