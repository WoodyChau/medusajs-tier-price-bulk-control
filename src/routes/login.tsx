import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FormEvent, useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export const Route = createFileRoute("/login")({
  component: LoginRoute,
})

function LoginRoute() {
  const navigate = useNavigate()
  const { login, isAuthenticated, isLoading } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: "/price-control", replace: true })
    }
  }, [isAuthenticated, isLoading, navigate])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)

    try {
      await login(email, password)
      navigate({ to: "/price-control", replace: true })
    } catch (err: any) {
      setError(err?.message || "Invalid email or password")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Medusa Admin Login</CardTitle>
          <CardDescription>Sign in with your Medusa admin user credentials.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
