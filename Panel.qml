pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "io.frihet.erp"
  ipcTarget: "io.frihet.erp"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null

  readonly property var barIdentity: hostWidget || root
  readonly property var state: hostWidget ? hostWidget.frihetState : Model.emptyState()
  readonly property string hostError: hostWidget ? String(hostWidget.lastError || "") : ""
  readonly property bool refreshing: hostWidget ? hostWidget.refreshing === true : false

  readonly property color contentForeground: bar ? bar.foreground : Color.foreground
  readonly property color contentDim: Qt.darker(contentForeground, 1.45)
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family

  function refresh() {
    if (hostWidget && typeof hostWidget.refresh === "function") {
      hostWidget.refresh()
    }
  }

  function openWebApp(subpath) {
    if (hostWidget && typeof hostWidget.openWebApp === "function") {
      hostWidget.openWebApp(subpath)
    }
  }

  function open() {
    refresh()
    root.controller.show()
  }

  function close() {
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function") {
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    }
    return false
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(420))
    contentHeight: panel.fittedContentHeight(content.implicitHeight, Style.space(560))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: content
        width: parent.width
        spacing: Style.space(10)

        RowLayout {
          width: parent.width
          spacing: Style.space(6)

          Column {
            Layout.fillWidth: true
            spacing: Style.space(2)

            Text {
              width: parent.width
              text: Model.clean(root.state.workspaceName || "Frihet ERP", 48)
              textFormat: Text.PlainText
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.subtitle
              font.bold: true
              elide: Text.ElideRight
            }

            Text {
              width: parent.width
              text: root.state.period
                ? "Period: " + Model.clean(root.state.period, 16)
                : "Monthly business snapshot"
              textFormat: Text.PlainText
              color: root.contentDim
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }
          }

          PanelActionButton {
            iconText: "󰑐"
            tooltipText: "Refresh"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            enabled: !root.refreshing
            onClicked: root.refresh()
          }

          PanelActionButton {
            iconText: "+"
            tooltipText: "New draft invoice"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            onClicked: {
              root.openWebApp("invoices/new")
              root.close()
            }
          }

          PanelActionButton {
            iconText: "↗"
            tooltipText: "Open Frihet ERP"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            onClicked: {
              root.openWebApp("")
              root.close()
            }
          }
        }

        Rectangle {
          width: parent.width
          height: 1
          color: Qt.rgba(root.contentForeground.r, root.contentForeground.g, root.contentForeground.b, 0.14)
        }

        Rectangle {
          visible: !root.state.configured || root.hostError !== ""
          width: parent.width
          implicitHeight: bannerText.implicitHeight + Style.space(12)
          radius: Style.radius ? Style.radius.small : 6
          color: Qt.rgba(root.urgent.r, root.urgent.g, root.urgent.b, 0.14)

          Text {
            id: bannerText
            anchors.left: parent.left
            anchors.leftMargin: Style.space(8)
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - Style.space(16)
            text: !root.state.configured
              ? "Run frihet-omarchy-setup in terminal to configure your Frihet API key."
              : Model.clean(root.hostError, 160)
            textFormat: Text.PlainText
            color: root.urgent
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }
        }

        GridLayout {
          width: parent.width
          columns: 2
          columnSpacing: Style.space(12)
          rowSpacing: Style.space(8)

          Column {
            Layout.fillWidth: true
            spacing: Style.space(2)

            Text {
              width: parent.width
              text: "Revenue"
              textFormat: Text.PlainText
              color: root.contentDim
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }

            Text {
              width: parent.width
              text: Model.formatMoney(root.state.revenueTotal, root.state.currency, root.state.mixedCurrency)
              textFormat: Text.PlainText
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
              font.bold: true
              elide: Text.ElideRight
            }
          }

          Column {
            Layout.fillWidth: true
            spacing: Style.space(2)

            Text {
              width: parent.width
              text: "Expenses"
              textFormat: Text.PlainText
              color: root.contentDim
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }

            Text {
              width: parent.width
              text: Model.formatMoney(root.state.expensesTotal, root.state.currency, root.state.mixedCurrency)
              textFormat: Text.PlainText
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
              font.bold: true
              elide: Text.ElideRight
            }
          }

          Column {
            Layout.fillWidth: true
            spacing: Style.space(2)

            Text {
              width: parent.width
              text: "Net Result"
              textFormat: Text.PlainText
              color: root.contentDim
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }

            Text {
              width: parent.width
              text: Model.formatMoney(root.state.netProfit, root.state.currency, root.state.mixedCurrency)
              textFormat: Text.PlainText
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
              font.bold: true
              elide: Text.ElideRight
            }
          }

          Column {
            Layout.fillWidth: true
            spacing: Style.space(2)

            Text {
              width: parent.width
              text: "Estimated VAT"
              textFormat: Text.PlainText
              color: root.contentDim
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }

            Text {
              width: parent.width
              text: Model.formatMoney(root.state.vatPayable, root.state.currency, root.state.mixedCurrency)
              textFormat: Text.PlainText
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
              font.bold: true
              elide: Text.ElideRight
            }
          }
        }

        Text {
          width: parent.width
          text: "Paid: " + root.state.paidCount + "  Sent: " + root.state.sentCount + "  Overdue: " + root.state.overdueCount + "  Drafts: " + root.state.draftCount
          textFormat: Text.PlainText
          color: root.state.overdueCount > 0 ? root.urgent : root.contentDim
          font.family: root.contentFontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }

        Rectangle {
          width: parent.width
          height: 1
          color: Qt.rgba(root.contentForeground.r, root.contentForeground.g, root.contentForeground.b, 0.14)
        }

        Text {
          width: parent.width
          text: "Recent Invoices"
          textFormat: Text.PlainText
          color: root.contentDim
          font.family: root.contentFontFamily
          font.pixelSize: Style.font.caption
          font.bold: true
          elide: Text.ElideRight
        }

        Text {
          visible: root.state.recentInvoices.length === 0
          width: parent.width
          text: root.state.loading ? "Loading..." : "No recent invoices in sample."
          textFormat: Text.PlainText
          color: root.contentDim
          font.family: root.contentFontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }

        Column {
          width: parent.width
          spacing: Style.space(4)

          Repeater {
            model: root.state.recentInvoices

            Row {
              required property var modelData
              width: parent.width
              spacing: Style.space(8)

              Text {
                width: Math.floor(parent.width * 0.62)
                text: Model.clean(parent.modelData.number + " " + parent.modelData.clientName, 48)
                textFormat: Text.PlainText
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }

              Text {
                width: Math.floor(parent.width * 0.34)
                horizontalAlignment: Text.AlignRight
                text: Model.clean(parent.modelData.amountText + " (" + parent.modelData.status + ")", 28)
                textFormat: Text.PlainText
                color: parent.modelData.status === "overdue" ? root.urgent : root.contentDim
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }
            }
          }
        }

        Text {
          visible: root.state.partialSample
          width: parent.width
          text: "Partial view: showing latest " + root.state.recentInvoices.length + " of " + root.state.totalInvoicesCount + " invoices"
          textFormat: Text.PlainText
          color: root.contentDim
          font.family: root.contentFontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }
      }
    }
  }
}
