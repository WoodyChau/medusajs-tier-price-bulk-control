import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { getCurrencies } from "@/lib/api"
import { sdk } from "@/lib/sdk"

type AuthContextValue = {
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const token = await sdk.client.getToken()

      if (!token) {
        setIsAuthenticated(false)
        return
      }

      await getCurrencies()
      setIsAuthenticated(true)
    } catch {
      try {
        await sdk.client.clearToken()
      } catch {
        // noop
      }

      setIsAuthenticated(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const checkSession = async () => {
      try {
        await refresh()
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    checkSession()

    return () => {
      mounted = false
    }
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const result = await sdk.auth.login("user", "emailpass", { email, password })

    if (typeof result !== "string") {
      throw new Error("Additional authentication step is required.")
    }

    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await sdk.auth.logout()
    } finally {
      try {
        await sdk.client.clearToken()
      } catch {
        // noop
      }

      setIsAuthenticated(false)
      setIsLoading(false)
    }
  }, [])

  const value = useMemo(
    () => ({
      isAuthenticated,
      isLoading,
      login,
      logout,
      refresh,
    }),
    [isAuthenticated, isLoading, login, logout, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }

  return context
}
