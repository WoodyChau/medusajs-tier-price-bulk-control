import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import viteTsConfigPaths from "vite-tsconfig-paths"

export default defineConfig(() => {
  const port = Number(process.env.VITE_PORT) || 5177

  return {
    server: {
      port,
      strictPort: true,
    },
    plugins: [
      viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
    ssr: {
      noExternal: ["@medusajs/js-sdk", "@medusajs/types"],
      optimizeDeps: {
        include: ["@medusajs/js-sdk"],
      },
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/react-router",
        "@medusajs/js-sdk",
      ],
    },
    resolve: {
      dedupe: ["react", "react-dom", "@tanstack/react-router"],
    },
  }
})
