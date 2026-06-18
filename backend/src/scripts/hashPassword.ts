import bcrypt from "bcryptjs";

// Usage: npm run auth:hash -- "the-password"
// Prints a bcrypt hash to paste into ADMIN_PASSWORD_HASH.
const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run auth:hash -- "your-password"');
  process.exit(1);
}

console.log(bcrypt.hashSync(password, 12));
