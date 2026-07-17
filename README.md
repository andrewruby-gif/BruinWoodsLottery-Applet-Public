# Bruin Woods Lottery Applet

A self-contained web applet for configuring and running the Bruin Woods waterfront lottery workflow.

## What is in this repo

- `index.html` - primary applet UI and logic
- `database.json` - applet data snapshot used for cloud sync/backup workflows
- `assets/` - compiled CSS for runtime styling
- `src/` - source styles and modular extraction scaffolding
- `scripts/` - QR and packaging helper scripts
- `package.json` - local tooling scripts and dependencies

## What was removed

This repository has been cleaned to include only applet-related code and data.
Legacy forms, spreadsheets, PDFs, generated export bundles, and reference-only files were removed.

## Local run

Open `index.html` directly in a browser, or run a static server if preferred.

## Dev setup

```bash
npm install
npm run build:css
```

Optional scripts:

```bash
npm run watch:css
npm run qr:html
npm run qr:zip
```

## Privacy and sharing

This project is intended to be shared from a private GitHub repository.
Before sharing access, verify `database.json` contents match your intended audience and remove any sensitive data not needed by collaborators.
