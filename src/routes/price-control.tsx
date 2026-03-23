import { AuthGuard } from "@/components/auth-guard"
import { PriceControlPage } from "@/components/price-control-page"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/price-control")({
  component: PriceControlRoute,
})

function PriceControlRoute() {
  return (
    <AuthGuard>
      <PriceControlPage />
    </AuthGuard>
  )
}
