# Changelog

All notable changes to `frihet-omarchy` are documented in this file.

## [1.0.0] - 2026-11-16

### Added
- **Omarchy Quattro Bar Widget (`io.frihet.erp`)**: `manifest.json`, `BarWidget.qml`, theme-aware `Panel.qml`, dual QML/Node `Model.js`, and `bin/frihet-omarchy-fetch` for live monthly revenue, overdue invoice alerts, VAT snapshot, and recent invoices.
- **Frameless Wayland Web App (`aur/frihet-webapp`)**: `frihet-erp-webapp`, XDG desktop entry, pinned Frihet Brand OS v1 icons, `install-omarchy-webapp.sh` one-liner, `PKGBUILD`, and `.SRCINFO`.
- **Terminal MCP + CLI (`aur/frihet-mcp`)**: Arch package wrapping `@frihet/mcp-server@2.0.2`, `frihet-omarchy-setup` (`0600` credential config + non-destructive Claude Code & OpenCode MCP setup), and `frihet-cli` (`status`, `monthly`, `quarterly`, `invoices`, and draft-only `draft-invoice`).
- **Verification & Security Gates**: `tests/omarchy-suite.test.mjs`, `scripts/no-public-leak.mjs`, and SHA-pinned GitHub Actions CI (`ci.yml`).
