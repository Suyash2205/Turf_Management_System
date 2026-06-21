import "dotenv/config";
import { syncBookingsFromEmail } from "../src/lib/email-sync";

async function main() {
  const full = process.argv.includes("--full");
  const result = await syncBookingsFromEmail(full);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
