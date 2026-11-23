import { openQuoteStore } from "./quote-store.mjs";

const limit = Number(process.argv[2] ?? 20);
const databaseUrl = process.env.TYMO_LEADS_DATABASE_URL;

if (process.argv.length > 3 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
  console.error("Usage: npm run quotes:list -- [limit from 1 to 100]");
  process.exitCode = 1;
} else if (!databaseUrl) {
  console.error("Set TYMO_LEADS_DATABASE_URL to the Tymo marketing database.");
  process.exitCode = 1;
} else {
  const quotes = openQuoteStore(databaseUrl);
  try {
    console.log(JSON.stringify(await quotes.list(limit), null, 2));
  } catch {
    console.error("Could not read quote requests. Check the marketing database connection and schema.");
    process.exitCode = 1;
  } finally {
    await quotes.close();
  }
}
