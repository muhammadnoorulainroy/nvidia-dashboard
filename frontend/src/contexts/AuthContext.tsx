import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { jwtDecode } from 'jwt-decode'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_PREFIX || '/api'
const TOKEN_KEY = 'nv_dash_token'

interface User {
  email: string
  name: string
  role: string
  picture?: string
}

interface JwtPayload {
  sub: string
  role: string
  name: string
  exp: number
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isAdmin: boolean
  loading: boolean
  login: (googleIdToken: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function isTokenValid(token: string): boolean {
  try {
    const { exp } = jwtDecode<JwtPayload>(token)
    return exp * 1000 > Date.now()
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (stored && isTokenValid(stored)) {
      const payload = jwtDecode<JwtPayload>(stored)
      setToken(stored)
      setUser({ email: payload.sub, name: payload.name, role: payload.role })
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (googleIdToken: string) => {
    const res = await axios.post(`${API_BASE}/auth/google`, { token: googleIdToken })
    const { access_token, user: userInfo } = res.data
    localStorage.setItem(TOKEN_KEY, access_token)
    setToken(access_token)
    setUser(userInfo)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        isAdmin: user?.role === 'admin',
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
