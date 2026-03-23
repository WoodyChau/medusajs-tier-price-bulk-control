import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAuth } from "@/lib/auth-context"
import { resolveAuthRedirect } from "@/lib/price-control-utils"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const redirectPath = resolveAuthRedirect({
    isLoading,
    isAuthenticated,
  })

  useEffect(() => {
    if (redirectPath === "/login") {
      navigate({ to: "/login", replace: true })
    }
  }, [navigate, redirectPath])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Checking session...
      </div>
    )
  }

  if (redirectPath === "/login") {
    return null
  }

  return <>{children}</>
}
