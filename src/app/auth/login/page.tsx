'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { loginSchema, type LoginInput } from '@/lib/validations'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

export default function LoginPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawCallback = searchParams.get('callbackUrl') || '/dashboard'
  // Relative-only guard: reject absolute URLs (`https://…`) and
  // protocol-relative (`//evil`) targets — fall back to /dashboard.
  const callbackUrl =
    rawCallback.startsWith('/') && !rawCallback.startsWith('//') ? rawCallback : '/dashboard'
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginInput) => {
    setError(null)
    setIsLoading(true)
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      })
      if (result?.error) {
        setError(ar ? 'الإيميل أو الباسورد غلط' : 'Invalid email or password')
      } else {
        router.push(callbackUrl)
        router.refresh()
      }
    } catch {
      setError(ar ? 'حصلت مشكلة. جرّب تاني.' : 'An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 py-8 sm:py-12">
      <div className="mashrabiya pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden="true" />
      <div className="cine-scrim" aria-hidden="true" />
      <div className="cine-vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <Reveal className="relative my-auto w-full max-w-md">
      <Card className="w-full border-estate-gold/25 shadow-xl shadow-estate-gold/5 dark:border-[#D4A843]/25">
        <CardHeader className="text-center">
          <CardTitle className="font-display display-3">{ar ? 'أهلاً برجوعك' : 'Welcome Back'}</CardTitle>
          <CardDescription>{ar ? 'سجّل دخول على حسابك في غاية' : 'Sign in to your GHAYA account'}</CardDescription>
          <hr className="gold-hairline mt-4" />
        </CardHeader>
        <CardContent className="space-y-4">
          {searchParams.get('registered') && (
            <div className="rounded-2xl bg-green-50 p-3 text-sm text-green-600 dark:bg-green-500/10 dark:text-green-400">
              {ar ? 'الحساب اتعمل بنجاح! سجّل دخول بقى.' : 'Account created successfully! Please sign in.'}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">{ar ? 'الإيميل' : 'Email'}</label>
              <Input className="text-base"
                type="email"
                placeholder="you@example.com"
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{ar ? 'الباسورد' : 'Password'}</label>
              <div className="relative">
                <Input className="text-base"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={ar ? 'إظهار أو إخفاء الباسورد' : 'Show or hide password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground rtl:left-3 rtl:right-auto"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="gold-shimmer w-full bg-estate-gold hover:bg-estate-gold-dark" disabled={isLoading}>
              {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {ar ? 'دخول' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {ar ? 'معندكش حساب؟' : "Don't have an account?"}{' '}
            <Link href="/contact" className="font-medium text-estate-gold hover:underline">
              {ar ? 'كلّمنا' : 'Contact Us'}
            </Link>
          </p>
        </CardContent>
      </Card>
      </Reveal>
    </div>
  )
}
