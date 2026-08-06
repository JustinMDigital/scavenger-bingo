import { loadEnv } from "vite";

const environment = loadEnv("production", process.cwd(), "");
const supportEmail = (
  process.env.VITE_SUPPORT_EMAIL ??
  environment.VITE_SUPPORT_EMAIL ??
  ""
).trim();
const googleClientId = (
  process.env.VITE_GOOGLE_CLIENT_ID ??
  environment.VITE_GOOGLE_CLIENT_ID ??
  ""
).trim();
const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validGoogleClientId =
  /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/;

if (
  !validEmail.test(supportEmail) ||
  /@example\.(com|org|net)$/i.test(supportEmail) ||
  /\.invalid$/i.test(supportEmail)
) {
  console.error(
    "Release stopped: set VITE_SUPPORT_EMAIL to a monitored public address before deployment.",
  );
  process.exit(1);
}
if (
  !validGoogleClientId.test(googleClientId) ||
  googleClientId.toLowerCase().startsWith("your-google-")
) {
  console.error(
    "Release stopped: set VITE_GOOGLE_CLIENT_ID to the approved Google OAuth web client before deployment.",
  );
  process.exit(1);
}

console.log(`Release contact verified: ${supportEmail}`);
console.log("Google OAuth client configuration verified.");
