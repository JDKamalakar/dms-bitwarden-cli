pragma Singleton
import QtQuick
import qs.Common
QtObject {
    readonly property real cornerRadius: Theme.cornerRadius
    readonly property real gapsOut: Theme.spacingM
    readonly property real normalBorderWidth: 1
    readonly property var font: ({family: Theme.fontFamily, body: Theme.fontSizeMedium,
        bodySmall: Theme.fontSizeSmall, caption: Theme.fontSizeSmall, subtitle: Theme.fontSizeLarge,
        title: Theme.fontSizeXLarge, display: Theme.fontSizeXLarge + 6, icon: Theme.iconSize})
    readonly property var bar: ({iconFont: Theme.iconSize})
    readonly property var spacing: ({panelPadding: Theme.spacingM, popupPadding: Theme.spacingM,
        controlPaddingX: Theme.spacingM, controlPaddingY: Theme.spacingS,
        inputPaddingY: Theme.spacingS, controlGap: Theme.spacingS, controlHeight: Theme.fontSizeMedium * 3,
        numberFieldWidth: Theme.fontSizeMedium * 10, sm: Theme.spacingS, md: Theme.spacingM})
    function space(n) { return n * (Theme.fontSizeMedium / 14); }
    function selectedStateColor(fg, accent) { return accent; }
    function hoverFillFor(fg, accent) { return Theme.withAlpha(accent || Theme.primary, 0.12); }
    function selectedFillFor(fg, accent) { return Theme.withAlpha(accent || Theme.primary, 0.20); }
    function pressedFillFor(fg, accent) { return Theme.withAlpha(accent || Theme.primary, 0.28); }
    function focusFillFor(fg, accent) { return Theme.withAlpha(accent || Theme.primary, 0.16); }
    function normalFillFor(fg, accent) { return Theme.surfaceContainerHigh; }
    function selectionFillFor(fg, accent) { return Theme.withAlpha(accent || Theme.primary, 0.35); }
    function controlFill(focused, hot, fg, accent) {
        return focused ? focusFillFor(fg, accent) : hot ? hoverFillFor(fg, accent) : Theme.surfaceContainerHigh;
    }
}
