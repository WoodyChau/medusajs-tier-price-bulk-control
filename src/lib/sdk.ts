import Medusa from "@medusajs/js-sdk"

const MEDUSA_BACKEND_URL =
  import.meta.env.VITE_MEDUSA_BACKEND_URL || "http://localhost:9000"

export const sdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: import.meta.env.DEV,
  auth: {
    type: "jwt",
  },
})
