'use client'

import Link from 'next/link'
import { Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

export default function RequestAccessPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 py-8 sm:py-12">
      <div className="mashrabiya pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden="true" />
      <Reveal className="relative my-auto w-full max-w-md">
      <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-estate-gold/10 ring-1 ring-estate-gold/30">
            <Lock className="h-6 w-6 text-estate-gold" />
          </div>
          <p className="section-kicker">{ar ? 'دعوة خاصة' : 'Private access'}</p>
          <CardTitle className="font-display display-3 mt-3">{ar ? 'بدعوة بس' : 'Invitation Only'}</CardTitle>
          <CardDescription>
            {ar ? 'غاية منصة خاصة. التسجيل بدعوة بس.' : 'GHAYA REAL ESTATE is a private platform. Registration is by invitation only.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-2xl border border-estate-gold/15 bg-muted p-4 text-sm dark:border-[#D4A843]/15">
            <p className="font-medium">{ar ? 'طلبات الحسابات مقفولة' : 'Account requests are closed'}</p>
            <p className="mt-2 text-muted-foreground">
              {ar ? 'مبقيناش بنقبل طلبات من أي حد. الحسابات بتتعمل بدعوة من الإدارة — كلّمنا وهنساعدك.' : 'We no longer accept public access requests. Account creation is by invitation from the administration — please contact us and we will help you.'}
            </p>
          </div>

          <div className="rounded-2xl border border-estate-gold/15 bg-muted p-4 text-sm dark:border-[#D4A843]/15">
            <p className="font-medium">{ar ? 'تاخد صلاحية إزاي:' : 'How to get access:'}</p>
            <ul className="mt-2 space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-estate-gold" />
                <span>{ar ? 'كلّم حد موجود أو حد من الإدارة يبعتلك لينك دعوة' : 'Contact an existing member or administrator to receive an invitation link'}</span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-estate-gold" />
                <span>{ar ? 'أول ما تتدعى، هيوصلك إيميل فيه لينك تسجيل خاص بيك' : "Once invited, you'll receive an email with a unique registration link"}</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <Link href="/contact" className="block">
              <Button className="w-full bg-estate-gold hover:bg-estate-gold-dark">
                {ar ? 'كلّمنا' : 'Contact Us'}
              </Button>
            </Link>
            <Link href="/auth/login" className="block">
              <Button variant="outline" className="w-full">
                {ar ? 'دخول' : 'Sign In'}
              </Button>
            </Link>
            <Link href="/" className="block">
              <Button variant="outline" className="w-full">
                {ar ? 'ارجع للرئيسية' : 'Back to Home'}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
      </Reveal>
    </div>
  )
}
