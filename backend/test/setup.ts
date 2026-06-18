import bcrypt from "bcryptjs";

// Credentials shared by the auth + route tests.
export const TEST_USERNAME = "admin";
export const TEST_PASSWORD = "s3cret-password";

process.env.JWT_SECRET = "test-jwt-secret";
process.env.ADMIN_USERNAME = TEST_USERNAME;
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 8);
// SEND_API_KEY intentionally left unset: the send gate is open in test mode.
