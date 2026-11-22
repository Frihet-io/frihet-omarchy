pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
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
  readonly property var snapshot: hostWidget ? hostWidget.frihetState : Model.emptyState()
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
    root.refresh()
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
    centerOnBar: false
    focusTarget: panel.loadedContent
    contentWidth: panel.fittedContentWidth(Style.space(420))
    contentHeight: panel.fittedContentHeight(panel.loadedContentHeight, Style.space(560))

    content: PanelKeyCatcher {
      id: keyCatcher
      implicitHeight: bodyColumn.implicitHeight
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(keyText) {
        if (keyText === "r") root.refresh()
        else if (keyText === "n") {
          root.openWebApp("invoices/new")
          root.close()
        } else if (keyText === "o") {
          root.openWebApp("")
          root.close()
        }
      }

      Column {
        id: bodyColumn
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
              text: Model.clean(root.snapshot.workspaceName || "Frihet ERP", 48)
              textFormat: Text.PlainText
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.subtitle
              font.bold: true
              elide: Text.ElideRight
            }

            Text {
              width: parent.width
              text: root.snapshot.period
                ? "Period: " + Model.clean(root.snapshot.period, 16)
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
            tooltipText: "Refresh (r)"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            enabled: !root.refreshing
            onClicked: root.refresh()
          }

          PanelActionButton {
            iconText: "+"
            tooltipText: "New draft invoice (n)"
            foreground: root.contentForeground
            fontFamily: root.contentFontFamily
            onClicked: {
              root.openWebApp("invoices/new")
              root.close()
            }
          }

          PanelActionButton {
            iconText: "↗"
            tooltipText: "Open Frihet ERP (o)"
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
          visible: !root.snapshot.configured || root.hostError !== ""
          width: parent.width
          implicitHeight: bannerText.implicitHeight + Style.space(12)
          radius: Style.cornerRadius
          color: Qt.rgba(root.urgent.r, root.urgent.g, root.urgent.b, 0.14)

          Text {
            id: bannerText
            anchors.left: parent.left
            anchors.leftMargin: Style.space(8)
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - Style.space(16)
            text: !root.snapshot.configured
              ? "Configure ~/.config/frihet/env (mode 0600) with FRIHET_API_KEY=fri_..."
              : Model.clean(root.hostError, 160)
            textFormat: Text.PlainText
            color: root.urgent
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }
        }

        Grid {
          id: metricsGrid
          width: parent.width
          columns: 2
          columnSpacing: Style.space(16)
          rowSpacing: Style.space(10)
          readonly property int cellWidth: Math.max(80, Math.floor((width - columnSpacing) / 2))

          Column {
            width: metricsGrid.cellWidth
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
              text: Model.formatMoney(root.snapshot.revenueTotal, root.snapshot.currency, root.snapshot.mixedCurrency)
              textFormat: Text.PlainText
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
              font.bold: true
              elide: Text.ElideRight
            }
          }

          Column {
            width: metricsGrid.cellWidth
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
              text: Model.formatMoney(root.snapshot.expensesTotal, root.snapshot.currency, root.snapshot.mixedCurrency)
              textFormat: Text.PlainText
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
              font.bold: true
              elide: Text.ElideRight
            }
          }

          Column {
            width: metricsGrid.cellWidth
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
              text: Model.formatMoney(root.snapshot.netProfit, root.snapshot.currency, root.snapshot.mixedCurrency)
              textFormat: Text.PlainText
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
              font.bold: true
              elide: Text.ElideRight
            }
          }

          Column {
            width: metricsGrid.cellWidth
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
              text: Model.formatMoney(root.snapshot.vatPayable, root.snapshot.currency, root.snapshot.mixedCurrency)
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
          text: "Paid: " + root.snapshot.paidCount + "  Sent: " + root.snapshot.sentCount + "  Overdue: " + root.snapshot.overdueCount + "  Drafts: " + root.snapshot.draftCount
          textFormat: Text.PlainText
          color: root.snapshot.overdueCount > 0 ? root.urgent : root.contentDim
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
          visible: root.snapshot.recentInvoices.length === 0
          width: parent.width
          text: root.snapshot.loading ? "Loading..." : "No recent invoices in sample."
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
            model: root.snapshot.recentInvoices

            Row {
              id: invoiceRow
              required property var modelData
              width: parent.width
              spacing: Style.space(8)

              Text {
                width: Math.floor(parent.width * 0.62)
                text: Model.clean(invoiceRow.modelData.number + " " + invoiceRow.modelData.clientName, 48)
                textFormat: Text.PlainText
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }

              Text {
                width: Math.floor(parent.width * 0.34)
                horizontalAlignment: Text.AlignRight
                text: Model.clean(invoiceRow.modelData.amountText + " (" + invoiceRow.modelData.status + ")", 28)
                textFormat: Text.PlainText
                color: invoiceRow.modelData.status === "overdue" ? root.urgent : root.contentDim
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }
            }
          }
        }

        Text {
          visible: root.snapshot.partialSample
          width: parent.width
          text: "Partial view: showing latest " + root.snapshot.recentInvoices.length + " of " + root.snapshot.totalInvoicesCount + " invoices"
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
