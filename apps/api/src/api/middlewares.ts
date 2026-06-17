import { defineMiddlewares } from "@medusajs/medusa";
import cors from "cors";

/**
 * CORS for the conversation-spine routes (WRDO-180).
 *
 * The spine lives under a CUSTOM /spine/* prefix (NOT /store/*) precisely so it
 * escapes Medusa's hard, namespace-wide publishable-key middleware — which the
 * framework applies to /store ONLY (see @medusajs/framework http/router.js:
 * `applyStorePublishableKeyMiddleware("/store")`, hardcoded, no per-route
 * opt-out). The spine's own gate is the signed wrdo_spine cookie.
 *
 * The trade-off: a custom prefix also gets NONE of the framework's per-namespace
 * CORS (which is wired for /admin, /store, /auth only). So we add it here.
 *
 * The widget reaches /spine/* same-origin through the storefront's Next rewrite,
 * so the browser sees same-origin and CORS is effectively moot for that path.
 * But the routes set/read a credentialed httpOnly cookie, so we apply a
 * credentials-aware CORS policy that reflects the configured storefront
 * origin(s) (STORE_CORS — the same allowlist the /store namespace uses) for any
 * direct/cross-origin caller. `credentials: true` is required for the cookie to
 * round-trip; a reflected explicit origin (never `*`) is mandatory alongside it.
 */
const storeCors = process.env.STORE_CORS ?? "";
const allowedOrigins = storeCors
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin !== "");

const spineCors = cors({
  // Reflect only configured storefront origins; wildcard is incompatible with
  // credentialed requests and would break the cookie.
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  credentials: true,
});

export default defineMiddlewares({
  routes: [
    {
      matcher: "/spine/*",
      middlewares: [spineCors],
    },
  ],
});
