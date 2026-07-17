#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const QRCode = require("qrcode");
const AdmZip = require("adm-zip");

function printUsage() {
  console.log(`
Usage:
  node scripts/zip-to-qr.js --input <fileOrFolder> [options]

Options:
  --input <path>         File or folder to package (required)
  --outdir <path>        Output directory (default: qr-output)
  --prefix <name>        Output file prefix (default: basename of input)
  --chunk-size <n>       Max chars per QR payload chunk (default: 700)
  --ec-level <L|M|Q|H>   QR error correction level (default: M)
  --single               Require output to fit in exactly one QR
  --mini                 Render smaller QR images (360px wide)
  --qr-width <n>         Explicit QR image width in px (overrides --mini)
  --brotli               Apply Brotli to zip bytes before QR encoding
  --help                 Show this message

Examples:
  node scripts/zip-to-qr.js --input . --prefix waterfront-mini --mini
  node scripts/zip-to-qr.js --input index.html --chunk-size 900 --ec-level L
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

function maxQrByteCapacity(ecLevel) {
  const caps = {
    L: 2953,
    M: 2331,
    Q: 1663,
    H: 1273,
  };
  return caps[ecLevel] || caps.M;
}

function shouldExclude(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  if (!normalized) return true;

  const blockedPrefixes = [
    ".git/",
    "node_modules/",
    "qr-output/",
  ];

  if (blockedPrefixes.some((p) => normalized.startsWith(p))) {
    return true;
  }

  return false;
}

function addPathToZip(zip, absPath, relPath) {
  const stat = fs.statSync(absPath);

  if (stat.isDirectory()) {
    const entries = fs.readdirSync(absPath, { withFileTypes: true });
    for (const entry of entries) {
      const childAbs = path.join(absPath, entry.name);
      const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
      addPathToZip(zip, childAbs, childRel);
    }
    return;
  }

  if (shouldExclude(relPath)) {
    return;
  }

  const data = fs.readFileSync(absPath);
  zip.addFile(relPath.replace(/\\/g, "/"), data);
}

function buildZipBuffer(inputPath) {
  const zip = new AdmZip();
  const stat = fs.statSync(inputPath);

  if (stat.isDirectory()) {
    const rootName = path.basename(inputPath);
    const entries = fs.readdirSync(inputPath, { withFileTypes: true });
    for (const entry of entries) {
      const childAbs = path.join(inputPath, entry.name);
      addPathToZip(zip, childAbs, entry.name);
    }
    return { buffer: zip.toBuffer(), rootName };
  }

  const fileName = path.basename(inputPath);
  zip.addFile(fileName, fs.readFileSync(inputPath));
  return { buffer: zip.toBuffer(), rootName: path.basename(fileName, path.extname(fileName)) };
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
    console.error(`Input path not found: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const outdirArg = getArg("--outdir") || "qr-output";
  const outdir = path.resolve(process.cwd(), outdirArg);

  const chunkSizeArg = getArg("--chunk-size");
  const chunkSize = chunkSizeArg ? Number(chunkSizeArg) : 700;
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

  const widthArg = getArg("--qr-width");
  const qrWidth = widthArg ? Number(widthArg) : hasFlag("--mini") ? 360 : 900;
  if (!Number.isFinite(qrWidth) || qrWidth < 180) {
    console.error("--qr-width must be a number >= 180.");
    process.exitCode = 1;
    return;
  }

  const { buffer: zipBytes, rootName } = buildZipBuffer(inputPath);
  const maybeBrotli = hasFlag("--brotli")
    ? zlib.brotliCompressSync(zipBytes, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        },
      })
    : zipBytes;

  const prefixArg = getArg("--prefix");
  const prefix = prefixArg || `${rootName.replace(/\s+/g, "-").toLowerCase()}-zip`;

  const payloadData = base64Url(maybeBrotli);
  const hash = crypto.createHash("sha256").update(payloadData).digest("hex").slice(0, 12);
  const singleMode = hasFlag("--single");
  const singlePayload = `BWZIPQR1|${hash}|1/1|${payloadData}`;
  const chunks = singleMode ? [payloadData] : chunkString(payloadData, chunkSize);
  const total = chunks.length;

  if (singleMode) {
    const maxCapacity = maxQrByteCapacity(ecLevel);
    if (singlePayload.length > maxCapacity) {
      console.error("Single QR mode failed: payload exceeds QR capacity.");
      console.error(`EC level ${ecLevel} max bytes (version 40): ~${maxCapacity}`);
      console.error(`Required payload chars: ${singlePayload.length}`);
      console.error(`ZIP bytes: ${zipBytes.length}; transformed bytes: ${maybeBrotli.length}`);
      console.error("Try a much smaller input, or disable --single to allow chunked QR output.");
      process.exitCode = 1;
      return;
    }
  }

  fs.mkdirSync(outdir, { recursive: true });

  const zipOutPath = path.join(outdir, `${prefix}.zip`);
  fs.writeFileSync(zipOutPath, zipBytes);

  const manifest = {
    version: "BWZIPQR1",
    input: path.relative(process.cwd(), inputPath),
    createdAt: new Date().toISOString(),
    hash,
    settings: {
      errorCorrectionLevel: ecLevel,
      chunkSize,
      single: singleMode,
      qrWidth,
      payloadTransform: hasFlag("--brotli") ? "zip+brotli+base64url" : "zip+base64url",
    },
    stats: {
      zipBytes: zipBytes.length,
      transformedBytes: maybeBrotli.length,
      payloadChars: payloadData.length,
      qrCount: total,
    },
    files: [],
  };

  for (let i = 0; i < total; i += 1) {
    const index = i + 1;
    const filename = `${prefix}-qr-${String(index).padStart(3, "0")}-of-${String(total).padStart(3, "0")}.png`;
    const payload = singleMode ? singlePayload : `BWZIPQR1|${hash}|${index}/${total}|${chunks[i]}`;
    const filePath = path.join(outdir, filename);

    await QRCode.toFile(filePath, payload, {
      errorCorrectionLevel: ecLevel,
      margin: 1,
      width: qrWidth,
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

  const notesPath = path.join(outdir, `${prefix}-how-to-decode.txt`);
  fs.writeFileSync(
    notesPath,
    [
      "Decode format: BWZIPQR1|<hash>|<index>/<total>|<chunk>",
      "1) Scan all QR images and collect each payload string.",
      "2) Verify hash and total match.",
      "3) Sort by index, concatenate all <chunk> values.",
      "4) Convert base64url -> bytes.",
      hasFlag("--brotli")
        ? "5) Brotli-decompress bytes to get the original zip file bytes."
        : "5) Treat bytes directly as the original zip file bytes.",
      "",
      `zipFile=${path.basename(zipOutPath)}`,
      `hash=${hash}`,
      `total=${total}`,
      `manifest=${path.basename(manifestPath)}`,
    ].join("\n"),
    "utf8"
  );

  console.log(`Created ZIP: ${path.relative(process.cwd(), zipOutPath)}`);
  console.log(`Created ${total} QR code image(s) in: ${path.relative(process.cwd(), outdir)}`);
  console.log(`Manifest: ${path.relative(process.cwd(), manifestPath)}`);
  console.log(`ZIP bytes: ${zipBytes.length}`);
  console.log(`Transformed bytes: ${maybeBrotli.length}`);
  console.log(`Payload chars: ${payloadData.length}`);

  if (total > 20) {
    console.log("Note: this is still a high QR count; QR is likely impractical for manual transfer.");
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
