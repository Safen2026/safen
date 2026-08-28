// Entrypoint. Kept separate from index.ts so the handler and decide() can be
// imported by tests without Deno.serve binding a port at module load.
import { handler } from "./index.ts";

Deno.serve(handler);
