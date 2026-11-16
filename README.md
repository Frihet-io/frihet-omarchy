# Frihet ERP for Omarchy

[![CI](https://github.com/Frihet-io/frihet-omarchy/actions/workflows/ci.yml/badge.svg)](https://github.com/Frihet-io/frihet-omarchy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Server](https://img.shields.io/badge/%40frihet%2Fmcp--server-2.0.2-black.svg)](https://www.npmjs.com/package/@frihet/mcp-server)

Official integration suite for running **Frihet ERP** on **Omarchy** (Arch Linux + Hyprland + Quickshell):

1. **Quickshell Bar Widget (`io.frihet.erp`)**: Live monthly revenue, overdue invoice alerts, VAT estimate, and recent invoices directly in the Omarchy bar, inheriting active theme colors and font family.
2. **Frameless Wayland Web App (`aur/frihet-webapp`)**: Launches `https://app.frihet.io` via `omarchy-launch-webapp` / Chromium `--app=` with official Frihet icons and zero browser chrome.
3. **Terminal MCP + CLI (`aur/frihet-mcp`)**: Packages `@frihet/mcp-server@2.0.2`, `frihet-omarchy-setup` (wires Claude Code and OpenCode in one command), and `frihet-cli`.

---

## 1. Quickshell Bar Widget (`io.frihet.erp`)

Install directly from GitHub on **Omarchy Quattro**:

```bash
omarchy plugin add https://github.com/Frihet-io/frihet-omarchy.git --enable
```

Or link a local clone for development:

```bash
mkdir -p ~/.config/omarchy/plugins
ln -sfn "$(pwd)" ~/.config/omarchy/plugins/io.frihet.erp
omarchy plugin validate ~/.config/omarchy/plugins/io.frihet.erp
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml
omarchy-shell shell rescanPlugins
omarchy plugin enable io.frihet.erp --section right
```

Optional Hyprland binding (`~/.config/hypr/bindings.conf`):

```ini
bindd = SUPER SHIFT, B, Frihet Summary, exec, omarchy-shell shell summon io.frihet.erp {}
```

Bar pill interactions:
- **Left-click**: Open or close summary panel
- **Middle-click**: Open `https://app.frihet.io`
- **Right-click**: Force immediate refresh

---

## 2. Frameless Wayland Web App (`aur/frihet-webapp`)

### Direct Omarchy Install

```bash
bash aur/frihet-webapp/install-omarchy-webapp.sh
```

### Build & Install via `makepkg`

```bash
cd aur/frihet-webapp
makepkg -si
```

Optional Hyprland shortcut (`~/.config/hypr/bindings.conf`):

```ini
bindd = SUPER SHIFT, F, Frihet ERP, exec, omarchy-launch-webapp "https://app.frihet.io"
```

---

## 3. Terminal MCP Server + CLI (`aur/frihet-mcp`)

### Build & Install Package

```bash
cd aur/frihet-mcp
makepkg -si
```

### Configure API Key & AI Agents

Run once to verify your `fri_...` API key against `/v1/context`, store `~/.config/frihet/env` (`0600`), and register the `frihet` MCP server in `~/.claude.json` (Claude Code) and `~/.config/opencode/opencode.json` (OpenCode):

```bash
frihet-omarchy-setup
```

### CLI Commands

```bash
frihet-cli status
frihet-cli monthly 2026-11
frihet-cli quarterly 2026-Q4
frihet-cli invoices --limit 10
frihet-cli draft-invoice --client-id cli_123 --description "Advisory" --qty 1 --unit-price 1500 --tax-rate 21
```

---

## Security & Fiscal Safety Invariants

- **Draft-only mutations**: `frihet-cli draft-invoice` and `@frihet/mcp-server` always create invoices with `status="draft"` and `Idempotency-Key` protection. Finalizing invoices, VeriFactu / AEAT / TicketBAI submissions, and real-money payments require explicit human confirmation in `https://app.frihet.io`.
- **Origin pinning & redirect protection**: API calls fail closed unless the target base URL resolves to `https://*.frihet.io` (loopback allowed only under explicit `FRIHET_ALLOW_LOOPBACK_TEST=1`), reject HTTP redirects (`redirect: "manual"`), and cap response bodies to 256 KiB.
- **UI & log hygiene**: QML `Text` nodes enforce `Text.PlainText` with bounded width and sanitized input (`Model.clean()`), and `fri_...` keys are masked in setup output and redacted from error messages.

---

## Development & Verification

```bash
node scripts/no-public-leak.mjs
node --test tests/omarchy-suite.test.mjs
```

See [SECURITY.md](SECURITY.md) for private vulnerability reporting and [LICENSE](LICENSE) (MIT).
