import QtQuick
Item {
    id: root
    property string pluginId: "bitwarden"
    property var pluginService: null
    readonly property string status: service.status
    readonly property bool colorizeIcon: service.colorizeIcon
    function toggle() { view.toggle() }
    function open() { view.open() }
    function close() { view.close() }
    function lockVault() { service.lockVault() }
    function openSettings() { service.openSettings() }
    function setAnchor(item, x, y, width, section, screen, position, thickness, spacing, config) {
        view.setAnchor(item, x, y, width, section, screen, position, thickness, spacing, config)
    }
    Service { id: service; pluginId: root.pluginId; pluginService: root.pluginService }
    Panel { id: view; vault: service }
}
