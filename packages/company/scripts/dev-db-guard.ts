import net from "node:net";
import { DEV_DB_PORT } from "@tymo/db/client";

/** Exit with a clear message if the dev database server (npm run dev) holds the local data. */
export async function assertDevDbStopped(): Promise<void> {
  if (process.env.DATABASE_URL) return;
  const inUse = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: DEV_DB_PORT });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
  if (inUse) {
    console.error(`The dev database is running on port ${DEV_DB_PORT}. Stop \`npm run dev\` first, then run this again.`);
    process.exit(1);
  }
}
