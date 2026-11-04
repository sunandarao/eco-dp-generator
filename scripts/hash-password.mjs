// Usage: npm run hash-password -- "<a strong password>"
import crypto from "node:crypto";

const pw = process.argv[2];
if (!pw || pw.length < 12) {
  console.error("Provide a password of at least 12 characters.");
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
console.log(`ADMIN_PASSWORD_HASH=scrypt:${salt.toString("base64")}:${hash.toString("base64")}`);
console.log(`ADMIN_SESSION_SECRET=${crypto.randomBytes(48).toString("base64url")}`);
