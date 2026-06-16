import { loadEnv } from '@medusajs/framework/utils'
import { withMercur } from '@mercurjs/core'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = withMercur({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      vendorCors: process.env.VENDOR_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  featureFlags: {
    seller_registration: true
  },
  modules: [
    {
      resolve: '@mercurjs/core/modules/admin-ui',
      options: {
        appDir: '',
        path: '/dashboard',
        disable: true
      }
    },
    {
      resolve: '@mercurjs/core/modules/vendor-ui',
      options: {
        appDir: '',
        path: '/seller',
        disable: true
      }
    },
    {
      resolve: './src/modules/whatsapp',
    },
    // NOTE: tribe-sessions is intentionally NOT registered as a Medusa module in
    // Step 1. Its TribeSession model would require a DB migration, and Cloud's
    // predeploy `medusa db:migrate` fails the whole backend deploy on the missing
    // migration. The WhatsApp reply path only needs the Redis-backed
    // ConversationStateService, which whatsapp imports directly (create-pipeline.ts)
    // — it is never resolved from the container. The model/MedusaService lands in a
    // later phase alongside the data-stack migration. See
    // docs/plans/2026-06-16-whatsapp-port-step1.md.
  ],
})
