# Bruin Woods Lottery Applet (Public)

This repository contains the distributable web applet files only.

## Download

### Windows

1. Open this repository page: https://github.com/andrewruby-gif/BruinWoodsLottery-Applet-Public
2. Click `Code`.
3. Click `Download ZIP`.
4. Right-click the downloaded ZIP and select `Extract All...`.
5. Open the extracted folder and double-click `index.html`.

### macOS

1. Open this repository page: https://github.com/andrewruby-gif/BruinWoodsLottery-Applet-Public
2. Click `Code`.
3. Click `Download ZIP`.
4. Open the ZIP in Downloads (it will unzip into a folder).
5. Open the extracted folder and double-click `index.html`.

## Optional: Run on Localhost (recommended for full PWA behavior)

If you have Node.js installed:

```bash
npx serve .
```

Then open the localhost URL shown in the terminal.

## Included Files

- `index.html`
- `assets/tailwind.css`
- `assets/app-icon.svg`
- `manifest.webmanifest`
- `pwa.js`
- `service-worker.js`
- `.nojekyll`
## Troubleshooting

### Windows

- If Windows SmartScreen warns on first open, choose More info, then Run anyway.
- If the browser blocks local features, run the app from localhost instead of opening the file directly.

### macOS

- If Gatekeeper blocks opening, Control-click index.html, choose Open, then confirm Open.
- If Safari blocks service worker behavior from a local file, run from localhost for full install and offline support.

### Localhost setup

1. Install Node.js if needed.
2. Open Terminal (macOS) or PowerShell (Windows) in the app folder.
3. Run: npx serve .
4. Open the localhost URL shown in terminal output.
