import QtQuick
import Quickshell
import Quickshell.Io
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "io.frihet.erp"

  property var frihetState: Model.emptyState()
  property string lastError: ""
  property bool refreshing: false

  readonly property string helperPath: decodeURIComponent(
    String(Qt.resolvedUrl("bin/frihet-omarchy-fetch")).replace(/^file:\/\//, "")
  )
  readonly property int refreshIntervalSec: boundedIntSetting("refreshIntervalSec", 300, 30, 3600)
  readonly property bool showAmountInBar: boolSetting("showAmountInBar", true)

  readonly property bool opened: panelLoader.item
    ? panelLoader.item.opened === true
    : false
  readonly property bool popoutSwitchClosing: panelLoader.item
    ? panelLoader.item.popoutSwitchClosing === true
    : false

  function boundedIntSetting(name, fallback, minimum, maximum) {
    var value = parseInt(String(setting(name, fallback)), 10)
    if (!isFinite(value)) value = fallback
    return Math.max(minimum, Math.min(maximum, value))
  }

  function boolSetting(name, fallback) {
    var value = setting(name, fallback)
    if (typeof value === "boolean") return value
    if (value === "true" || value === "1" || value === 1) return true
    if (value === "false" || value === "0" || value === 0) return false
    return fallback
  }

  function refresh() {
    if (collector.running) return
    refreshing = true
    lastError = ""
    collector.command = ["node", root.helperPath]
    collector.running = true
  }

  function applyPayload(raw, exitCode) {
    refreshing = false
    var parsed = Model.parsePayload(raw)
    if (!parsed.ok || exitCode !== 0) {
      var errText = parsed.error || "Could not refresh Frihet ERP status"
      lastError = errText
      if (!parsed.configured || !frihetState.ok) {
        frihetState = parsed.state
      }
      return
    }
    lastError = ""
    frihetState = parsed.state
  }

  function openWebApp(subpath) {
    var cleanPath = String(subpath || "").replace(/^\/+/, "")
    if (!/^[A-Za-z0-9/_?=&.%-]*$/.test(cleanPath)) {
      cleanPath = ""
    }
    Quickshell.execDetached([
      "sh",
      "-c",
      "if command -v frihet-erp-webapp >/dev/null 2>&1; then exec frihet-erp-webapp \"$1\"; elif command -v omarchy-launch-webapp >/dev/null 2>&1; then TARGET=\"https://app.frihet.io\"; if [ -n \"$1\" ]; then TARGET=\"$TARGET/$1\"; fi; exec omarchy-launch-webapp \"$TARGET\"; else TARGET=\"https://app.frihet.io\"; if [ -n \"$1\" ]; then TARGET=\"$TARGET/$1\"; fi; exec xdg-open \"$TARGET\"; fi",
      "sh",
      cleanPath
    ])
  }

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function toggle() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function injectPanel() {
    if (!panelLoader.item) return
    panelLoader.item.bar = root.bar
    panelLoader.item.anchorItem = button
    panelLoader.item.hostWidget = root
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: {
    injectPanel()
    refresh()
  }

  Timer {
    interval: root.refreshIntervalSec * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  Process {
    id: collector
    command: []
    stdout: StdioCollector {
      id: collectorOutput
      waitForEnd: true
    }
    stderr: StdioCollector {
      id: collectorError
      waitForEnd: true
    }
    onExited: function(exitCode) {
      root.applyPayload(collectorOutput.text, exitCode)
      if (exitCode !== 0 && root.lastError === "") {
        var detail = Model.clean(collectorError.text || "", 120)
        root.lastError = detail || "Could not refresh Frihet ERP status"
      }
    }
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  IpcHandler {
    target: root.moduleName

    function refresh(): void { root.refresh() }
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: Model.barLabel(root.frihetState, root.showAmountInBar, root.refreshing, root.lastError)
    active: root.opened
    tooltipText: Model.tooltipLabel(root.frihetState, root.lastError)
    horizontalMargin: 8.75
    verticalPadding: 8.75

    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) root.toggle()
      else if (buttonCode === Qt.MiddleButton) root.openWebApp("")
      else if (buttonCode === Qt.RightButton) root.refresh()
    }
  }
}
