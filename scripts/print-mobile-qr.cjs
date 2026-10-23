const qrcode = require("../frontend/node_modules/qrcode-terminal");

const url = process.argv[2];
if (!url) {
  process.stderr.write("Usage: node scripts/print-mobile-qr.cjs <url>\n");
  process.exit(2);
}

qrcode.generate(url, { small: true });
