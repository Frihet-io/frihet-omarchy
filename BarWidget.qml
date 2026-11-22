import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "io.frihet.erp"

  property var frihetState: Model.emptyState()
  property string lastError: ""
  property bool refreshing: false
  property int activeGeneration: 0
  property int runningGeneration: 0
  property string stdoutBuffer: ""
  property string stderrBuffer: ""
  property bool streamOverflowed: false

  readonly property int maxStdoutChars: 65536
  readonly property int maxStderrChars: 2048
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
    const value = parseInt(String(root.setting(name, fallback)), 10)
    const cleanVal = isFinite(value) ? value : fallback
    return Math.max(minimum, Math.min(maximum, cleanVal))
  }

  function boolSetting(name, fallback) {
    const value = root.setting(name, fallback)
    if (typeof value === "boolean") return value
    if (value === "true" || value === "1" || value === 1) return true
    if (value === "false" || value === "0" || value === 0) return false
    return fallback
  }

  function abortCollector(reason) {
    root.streamOverflowed = true
    root.lastError = Model.clean(reason || "Refresh aborted", 120)
    root.refreshing = false
    deadlineTimer.stop()
    if (collector.running) {
      collector.signal(15)
      killTimer.restart()
    }
  }

  function refresh() {
    if (collector.running) return
    root.activeGeneration = root.activeGeneration + 1
    root.runningGeneration = root.activeGeneration
    root.stdoutBuffer = ""
    root.stderrBuffer = ""
    root.streamOverflowed = false
    root.refreshing = true
    collector.command = [
      "/usr/bin/setsid",
      "-w",
      "/usr/bin/timeout",
      "-k",
      "2",
      "--",
      "12",
      "/usr/bin/python3",
      "-I",
      root.helperPath
    ]
    deadlineTimer.restart()
    collector.running = true
  }

  function applyPayload(raw, exitCode) {
    root.refreshing = false
    const parsed = Model.parsePayload(raw)
    if (!parsed.ok || exitCode !== 0) {
      const errText = parsed.error || "Could not refresh Frihet ERP status"
      root.lastError = errText
      if (!parsed.configured || !root.frihetState.ok) {
        root.frihetState = parsed.state
      }
      return
    }
    root.lastError = ""
    root.frihetState = parsed.state
  }

  function openWebApp(subpath) {
    const cleanPath = String(subpath || "").replace(/^\/+/, "")
    let targetUrl = "https://app.frihet.io"
    if (
      cleanPath.length > 0 &&
      cleanPath.length <= 64 &&
      !cleanPath.includes("..") &&
      !cleanPath.startsWith("-") &&
      /^[A-Za-z0-9/_-]+$/.test(cleanPath)
    ) {
      targetUrl = "https://app.frihet.io/" + cleanPath
    }
    Quickshell.execDetached(["/usr/bin/xdg-open", "--", targetUrl])
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

  onBarChanged: root.injectPanel()
  onSettingsChanged: {
    root.injectPanel()
    root.refresh()
  }

  Component.onDestruction: {
    deadlineTimer.stop()
    killTimer.stop()
    if (collector.running) {
      collector.signal(15)
    }
  }

  Timer {
    interval: root.refreshIntervalSec * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  Timer {
    id: deadlineTimer
    interval: 14000
    repeat: false
    onTriggered: {
      if (collector.running) {
        root.abortCollector("Refresh timed out")
      }
    }
  }

  Timer {
    id: killTimer
    interval: 2000
    repeat: false
    onTriggered: {
      if (collector.running) {
        collector.signal(9)
      }
    }
  }

  Process {
    id: collector
    command: []
    clearEnvironment: true
    environment: ({
      PATH: "/usr/bin:/bin",
      LANG: "C.UTF-8"
    })
    stdout: SplitParser {
      splitMarker: ""
      onRead: function(chunk) {
        if (root.streamOverflowed) return
        root.stdoutBuffer += chunk
        if (root.stdoutBuffer.length > root.maxStdoutChars) {
          root.stdoutBuffer = ""
          root.abortCollector("Helper output exceeded size limit")
        }
      }
    }
    stderr: SplitParser {
      splitMarker: ""
      onRead: function(chunk) {
        if (root.streamOverflowed) return
        if (root.stderrBuffer.length <= root.maxStderrChars) {
          root.stderrBuffer += chunk
        }
      }
    }
    onExited: function(exitCode) {
      deadlineTimer.stop()
      killTimer.stop()
      const gen = root.runningGeneration
      const out = root.stdoutBuffer
      const err = root.stderrBuffer
      const overflowed = root.streamOverflowed
      root.stdoutBuffer = ""
      root.stderrBuffer = ""
      if (gen !== root.activeGeneration || overflowed) {
        root.refreshing = false
        return
      }
      root.applyPayload(out, exitCode)
      if (exitCode !== 0 && root.lastError === "") {
        const detail = Model.clean(err, 120)
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

  ShellIpc {
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
