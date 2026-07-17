#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const QRCode = require("qrcode");
const { minify } = require("html-minifier-terser");

function printUsage() {
  console.log(`
Usage:
  node scripts/html-to-qr.js --input <htmlFile> [options]

Options:
  --input <path>         Input HTML file (required)
  --outdir <path>        Output directory (default: qr-output)
  --prefix <name>        Output file prefix (default: basename of input)
  --chunk-size <n>       Max chars per QR payload chunk (default: 900)
  --ec-level <L|M|Q|H>   QR error correction level (default: M)
  --no-minify            Skip HTML minification before compression
  --help                 Show this message

Examples:
  node scripts/html-to-qr.js --input index.html
  node scripts/html-to-qr.js --input "Waterfront Forms/form.html" --outdir dist/qr --chunk-size 700
`);
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function chunkString(str, chunkSize) {
  const chunks = [];
  for (let i = 0; i < str.length; i += chunkSize) {
    chunks.push(str.slice(i, i + chunkSize));
  }
  return chunks;
}

async function maybeMinifyHtml(html, shouldMinify) {
  if (!shouldMinify) return html;

  return minify(html, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeOptionalTags: false,
    minifyCSS: true,
    minifyJS: true,
    keepClosingSlash: true,
  });
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  const input = getArg("--input");
  if (!input) {
    console.error("Missing required --input argument.");
    printUsage();
    process.exitCode = 1;
    return;
  }

  const inputPath = path.resolve(process.cwd(), input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const outdirArg = getArg("--outdir") || "qr-output";
  const outdir = path.resolve(process.cwd(), outdirArg);
  const prefixArg = getArg("--prefix");
  const prefix =
    prefixArg || path.basename(inputPath, path.extname(inputPath)).replace(/\s+/g, "-").toLowerCase();

  const chunkSizeArg = getArg("--chunk-size");
  const chunkSize = chunkSizeArg ? Number(chunkSizeArg) : 900;
  if (!Number.isFinite(chunkSize) || chunkSize < 200) {
    console.error("--chunk-size must be a number >= 200.");
    process.exitCode = 1;
    return;
  }

  const ecLevel = (getArg("--ec-level") || "M").toUpperCase();
  if (!["L", "M", "Q", "H"].includes(ecLevel)) {
    console.error("--ec-level must be one of: L, M, Q, H.");
    process.exitCode = 1;
    return;
  }

  const shouldMinify = !hasFlag("--no-minify");

  const rawHtml = fs.readFileSync(inputPath, "utf8");
  const normalizedHtml = rawHtml.replace(/\r\n/g, "\n");
  const minifiedHtml = await maybeMinifyHtml(normalizedHtml, shouldMinify);

  const compressed = zlib.brotliCompressSync(Buffer.from(minifiedHtml, "utf8"), {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    },
  });

  const payloadData = base64Url(compressed);
  const hash = crypto.createHash("sha256").update(payloadData).digest("hex").slice(0, 12);

  const chunks = chunkString(payloadData, chunkSize);
  const total = chunks.length;

  fs.mkdirSync(outdir, { recursive: true });

  const manifest = {
    version: "BWLQR1",
    input: path.relative(process.cwd(), inputPath),
    createdAt: new Date().toISOString(),
    hash,
    settings: {
      minified: shouldMinify,
      errorCorrectionLevel: ecLevel,
      chunkSize,
      compression: "brotli+base64url",
    },
    stats: {
      originalBytes: Buffer.byteLength(normalizedHtml, "utf8"),
      minifiedBytes: Buffer.byteLength(minifiedHtml, "utf8"),
      compressedBytes: compressed.length,
      payloadChars: payloadData.length,
      qrCount: total,
    },
    files: [],
  };

  for (let i = 0; i < total; i += 1) {
    const index = i + 1;
    const filename = `${prefix}-qr-${String(index).padStart(3, "0")}-of-${String(total).padStart(3, "0")}.png`;
    const payload = `BWLQR1|${hash}|${index}/${total}|${chunks[i]}`;
    const filePath = path.join(outdir, filename);

    await QRCode.toFile(filePath, payload, {
      errorCorrectionLevel: ecLevel,
      margin: 1,
      width: 900,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    manifest.files.push({
      index,
      total,
      filename,
      payloadChars: payload.length,
    });
  }

  const manifestPath = path.join(outdir, `${prefix}-manifest.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const instructionsPath = path.join(outdir, `${prefix}-how-to-decode.txt`);
  fs.writeFileSync(
    instructionsPath,
    [
      "Decode format: BWLQR1|<hash>|<index>/<total>|<chunk>",
      "1) Scan all QR images and collect each payload string.",
      "2) Verify hash and total match across all scans.",
      "3) Sort by index, concatenate all <chunk> parts.",
      "4) Convert base64url to bytes, Brotli-decompress, parse as UTF-8 HTML.",
      "",
      `hash=${hash}`,
      `total=${total}`,
      `manifest=${path.basename(manifestPath)}`,
    ].join("\n"),
    "utf8"
  );

  console.log(`Created ${total} QR code image(s) in: ${path.relative(process.cwd(), outdir)}`);
  console.log(`Manifest: ${path.relative(process.cwd(), manifestPath)}`);
  console.log(`Original bytes: ${manifest.stats.originalBytes}`);
  console.log(`Minified bytes: ${manifest.stats.minifiedBytes}`);
  console.log(`Compressed bytes: ${manifest.stats.compressedBytes}`);
  console.log(`Payload chars: ${manifest.stats.payloadChars}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
