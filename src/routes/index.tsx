import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { resolveAuthRedirect } from "@/lib/price-control-utils"

export const Route = createFileRoute("/")({
  component: HomeRoute,
})

function HomeRoute() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useAuth()
  const redirectPath = resolveAuthRedirect({
    isLoading,
    isAuthenticated,
  })

  useEffect(() => {
    if (!redirectPath) {
      return
    }

    navigate({
      to: redirectPath,
      replace: true,
    })
  }, [navigate, redirectPath])

  return null
}
