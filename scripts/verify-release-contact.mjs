import { loadEnv } from "vite";

const environment = loadEnv("production", process.cwd(), "");
const supportEmail = (
  process.env.VITE_SUPPORT_EMAIL ??
  environment.VITE_SUPPORT_EMAIL ??
  ""
).trim();
const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!validEmail.test(supportEmail)) {
  console.error(
    "Release stopped: set VITE_SUPPORT_EMAIL to a monitored public address before deployment.",
  );
  process.exit(1);
}

console.log(`Release contact verified: ${supportEmail}`);
