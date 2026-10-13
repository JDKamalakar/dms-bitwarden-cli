pragma Singleton
import QtQuick
import qs.Common
QtObject {
    readonly property color foreground: Theme.surfaceText
    readonly property color background: Theme.surface
    readonly property color accent: Theme.primary
    readonly property color urgent: Theme.error
    readonly property var popups: ({background: Theme.surfaceContainer, border: Theme.outline, text: Theme.surfaceText})
    readonly property var tooltip: ({background: Theme.surfaceContainerHigh, border: Theme.outline, text: Theme.surfaceText})
    readonly property var menu: ({scrim: Theme.withAlpha(Theme.surface, 0.5)})
}
