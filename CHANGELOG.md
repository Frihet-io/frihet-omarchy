# Changelog

All notable changes to `frihet-omarchy` are documented in this file.

## [1.1.0] - 2026-11-22

### Changed
- Dedicated repository exclusively to the `io.frihet.erp` Omarchy Quattro bar widget (moved Arch Linux PKGBUILDs and CLI tools to `Frihet-io/frihet-arch` for clean zero-capability Marketplace verification).
- Replaced Node.js fetch helper with stock `/usr/bin/python3 -I` stdlib helper using `O_NOFOLLOW` descriptor-chain validation on `~/.config/frihet/env` (`0600`), fixed `https://api.frihet.io/v1` origin, disabled proxies, and strict byte/time caps.
- Replaced `StdioCollector` and shell wrappers in `BarWidget.qml` with chunk-bounded `SplitParser`, process-group `setsid` + `timeout` supervision, generation tracking, and `Component.onDestruction` teardown.
- Hardened `Model.js` string sanitization (`<`, `>`, `&`, C0/C1, bidi controls) and null-prototype currency maps; added live Quickshell `preview.png` and `qmllint` clean verification.

## [1.0.0] - 2026-11-16

### Added
- Initial release of `io.frihet.erp` Quickshell bar widget (`manifest.json`, `BarWidget.qml`, `Panel.qml`, `Model.js`, `bin/frihet-omarchy-fetch`).
