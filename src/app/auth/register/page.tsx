'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { registerSchema, type RegisterInput } from '@/lib/validations'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

export default function RegisterPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'BUYER' },
  })

  // No token = access denied
  if (!token) {
    return (
      <div className="relative flex min-h-[calc(100vh-4rem)] min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 py-8 sm:py-12">
        <div className="mashrabiya pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden="true" />
      <div className="cine-scrim" aria-hidden="true" />
      <div className="cine-vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
        <Reveal className="relative my-auto w-full max-w-md">
        <Card className="w-full border-estate-gold/25 shadow-xl shadow-estate-gold/5 dark:border-[#D4A843]/25">
          <CardContent className="flex flex-col items-center p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
              <Lock className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="font-display display-3 mt-4">{ar ? 'مفيش صلاحية' : 'Access Denied'}</h2>
            <hr className="gold-hairline mt-4 w-full" />
            <p className="mt-2 text-sm text-muted-foreground">
              {ar ? 'التسجيل بدعوة بس. لازم يكون معاك لينك دعوة ساري عشان تعمل حساب.' : 'Registration is by invitation only. You need a valid invitation link to create an account.'}
            </p>
            <Link href="/auth/login" className="mt-6">
              <Button variant="outline">
                {ar ? 'روح على الدخول' : 'Go to Login'}
              </Button>
            </Link>
          </CardContent>
        </Card>
        </Reveal>
      </div>
    )
  }

  const onSubmit = async (data: RegisterInput) => {
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, token }),
      })
      const result = await res.json()
      if (!res.ok) {
        console.error('register failed', result.error)
        setError(ar ? 'التسجيل فشل — جرّب تاني.' : 'Registration failed')
      } else {
        router.push('/auth/login?registered=true')
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
          <CardTitle className="font-display display-3">{ar ? 'اعمل حساب' : 'Create Account'}</CardTitle>
          <CardDescription>{ar ? 'اتبعتلك دعوة تنضم لغاية العقارية' : "You've been invited to join GHAYA REAL ESTATE"}</CardDescription>
          <hr className="gold-hairline mt-4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">{ar ? 'الاسم بالكامل' : 'Full Name'}</label>
              <Input className="text-base" placeholder="Ahmed Hassan" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{ar ? 'الإيميل' : 'Email'}</label>
              <Input className="text-base" type="email" placeholder="you@example.com" {...register('email')} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{ar ? 'التليفون (اختياري)' : 'Phone (optional)'}</label>
              <Input className="text-base" type="tel" placeholder="+20 1XX XXX XXXX" {...register('phone')} />
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

            <div className="space-y-2">
              <label className="text-sm font-medium">{ar ? 'أكّد الباسورد' : 'Confirm Password'}</label>
              <Input className="text-base"
                type="password"
                placeholder="••••••••"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
            </div>

            <div className="rounded-2xl bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              {ar ? 'الدور بتاعك متظبط على حسب الدعوة. لو شايف إن في غلط، كلّم اللي بعتلك الدعوة.' : 'Your role has been pre-set based on your invitation. If you believe this is an error, please contact the person who invited you.'}
            </div>

            <Button type="submit" className="gold-shimmer w-full bg-estate-gold hover:bg-estate-gold-dark" disabled={isLoading}>
              {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {ar ? 'اعمل حساب' : 'Create Account'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {ar ? 'عندك حساب؟' : 'Already have an account?'}{' '}
            <Link href="/auth/login" className="font-medium text-estate-gold hover:underline">
              {ar ? 'سجّل دخول' : 'Sign in'}
            </Link>
          </p>
        </CardContent>
      </Card>
      </Reveal>
    </div>
  )
}
