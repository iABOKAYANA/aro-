'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Phone, Mail, MapPin, MessageSquare, Clock, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { inquirySchema, type InquiryInput } from '@/lib/validations'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

export const dynamic = 'force-dynamic'

export default function ContactPage() {
  return (
    <Suspense>
      <ContactForm />
    </Suspense>
  )
}

function ContactForm() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const searchParams = useSearchParams()
  // Prefilled inquiry context (e.g. a showcase-model card links here with
  // ?message=… naming the model type) — real user-typed text otherwise.
  const prefill = searchParams.get('message') || ''
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<InquiryInput>({
    resolver: zodResolver(inquirySchema),
    defaultValues: { message: prefill },
  })

  const onSubmit = async (data: InquiryInput) => {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const payload = await res.json().catch(() => ({}))
      if (res.ok) {
        setIsSubmitted(true)
        reset()
      } else {
        console.error('inquiry failed', payload.error)
        setSubmitError(ar ? 'حصلت مشكلة والرسالة متبعتتش — جرّب تاني.' : 'Something went wrong sending your message — please try again.')
      }
    } catch (error) {
      console.error('inquiry error', error)
      setSubmitError(ar ? 'حصلت مشكلة والرسالة متبعتتش — جرّب تاني.' : 'Something went wrong sending your message — please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <section className="cine-hero" style={{ height: '60svh', minHeight: '420px', maxHeight: '600px' }}>
        <div className="cine-scrim" aria-hidden="true" />
        <div className="cine-vignette" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col items-center justify-center px-4 text-center">
          <Reveal className="flex flex-col items-center">
            <p className="cine-kicker">{ar ? 'فريق غاية' : 'The GHAYA team'}</p>
            <h1 className="cine-title mt-4">{ar ? 'كلّمنا' : 'Contact Us'}</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[#faf7ef]/85">
              {ar ? 'ابعت لفريقنا لو عندك أي استفسار' : 'Get in touch with our team for any inquiries'}
            </p>
          </Reveal>
        </div>
      </section>
      <div className="container relative px-4 py-8 md:py-12">
      <div className="relative mx-auto max-w-5xl">

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-4">
            <Reveal delay={0}>
            <Card className="border-estate-gold/20 transition-colors hover:border-estate-gold/50 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#D4A843]/20 dark:hover:border-[#D4A843]/40">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="shrink-0 rounded-2xl bg-estate-gold/10 p-3">
                  <Phone className="h-5 w-5 text-estate-gold" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{ar ? 'التليفون' : 'Phone'}</p>
                  <p className="break-words font-medium">+20 2 1234 5678</p>
                </div>
              </CardContent>
            </Card>
            </Reveal>
            <Reveal delay={80}>
            <Card className="border-estate-gold/20 transition-colors hover:border-estate-gold/50 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#D4A843]/20 dark:hover:border-[#D4A843]/40">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="shrink-0 rounded-2xl bg-estate-gold/10 p-3">
                  <Mail className="h-5 w-5 text-estate-gold" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{ar ? 'الإيميل' : 'Email'}</p>
                  <p className="break-words font-medium">info@estateai.eg</p>
                </div>
              </CardContent>
            </Card>
            </Reveal>
            <Reveal delay={160}>
            <Card className="border-estate-gold/20 transition-colors hover:border-estate-gold/50 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#D4A843]/20 dark:hover:border-[#D4A843]/40">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="shrink-0 rounded-2xl bg-estate-gold/10 p-3">
                  <MapPin className="h-5 w-5 text-estate-gold" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{ar ? 'العنوان' : 'Address'}</p>
                  <p className="break-words font-medium">{ar ? 'القاهرة الجديدة، القاهرة، مصر' : 'New Cairo, Cairo, Egypt'}</p>
                </div>
              </CardContent>
            </Card>
            </Reveal>
            <Reveal delay={240}>
            <Card className="border-estate-gold/20 transition-colors hover:border-estate-gold/50 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#D4A843]/20 dark:hover:border-[#D4A843]/40">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="shrink-0 rounded-2xl bg-estate-gold/10 p-3">
                  <Clock className="h-5 w-5 text-estate-gold" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{ar ? 'مواعيد الشغل' : 'Working Hours'}</p>
                  <p className="break-words font-medium">{ar ? 'الحد - الخميس: 9 الصبح - 6 المغرب' : 'Sun - Thu: 9AM - 6PM'}</p>
                </div>
              </CardContent>
            </Card>
            </Reveal>
          </div>

          <div className="lg:col-span-2">
            <Reveal delay={80}>
            <Card className="border-estate-gold/20 dark:border-[#D4A843]/20">
              <CardHeader>
                <CardTitle as="h2" className="font-display display-3">{ar ? 'ابعت لنا رسالة' : 'Send Us a Message'}</CardTitle>
                <hr className="gold-hairline mt-4" />
              </CardHeader>
              <CardContent>
                {isSubmitted ? (
                  <div className="py-8 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/10">
                      <MessageSquare className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="text-lg font-semibold">{ar ? 'الرسالة اتبعتت!' : 'Message Sent!'}</h3>
                    <p className="mt-2 text-muted-foreground">
                      {ar ? 'هنرد عليك خلال 24 ساعة.' : "We'll get back to you within 24 hours."}
                    </p>
                    <Button onClick={() => setIsSubmitted(false)} className="mt-4 min-h-[44px] sm:min-h-0">
                      {ar ? 'ابعت رسالة تانية' : 'Send Another Message'}
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{ar ? 'الاسم *' : 'Name *'}</label>
                        <Input placeholder={ar ? 'اسمك' : 'Your name'} {...register('name')} className="text-base sm:text-sm" />
                        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{ar ? 'التليفون *' : 'Phone *'}</label>
                        <Input type="tel" placeholder="+20 1XX XXX XXXX" {...register('phone')} className="text-base sm:text-sm" />
                        {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{ar ? 'الإيميل' : 'Email'}</label>
                      <Input type="email" placeholder="your@email.com" {...register('email')} className="text-base sm:text-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{ar ? 'نوع الاستفسار' : 'Inquiry Type'}</label>
                      <select
                        className="flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-base sm:h-10 sm:text-sm"
                        aria-label={ar ? 'نوع الاستفسار' : 'Inquiry Type'}
                        {...register('type')}
                      >
                        <option value="GENERAL">{ar ? 'استفسار عام' : 'General Inquiry'}</option>
                        <option value="VISIT_REQUEST">{ar ? 'احجز زيارة' : 'Schedule a Visit'}</option>
                        <option value="PRICE_INQUIRY">{ar ? 'استفسار عن السعر' : 'Price Inquiry'}</option>
                        <option value="AVAILABILITY">{ar ? 'اتأكد إنها متاحة' : 'Availability Check'}</option>
                        <option value="PAYMENT_PLAN">{ar ? 'معلومات عن التقسيط' : 'Payment Plan Info'}</option>
                        <option value="CALLBACK">{ar ? 'اطلب حد يكلّمك' : 'Request a Callback'}</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{ar ? 'الرسالة' : 'Message'}</label>
                      <textarea
                        className="flex min-h-[120px] w-full rounded-2xl border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                        placeholder={ar ? 'قولّنا محتاج إيه...' : 'Tell us about your requirements...'}
                        {...register('message')}
                      />
                    </div>
                    <Button type="submit" className="gold-shimmer min-h-[44px] w-full bg-estate-gold hover:bg-estate-gold-dark sm:min-h-0" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {ar ? 'ابعت الرسالة' : 'Send Message'}
                    </Button>
                    {submitError && (
                      <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{submitError}</span>
                      </div>
                    )}
                  </form>
                )}
              </CardContent>
            </Card>
            </Reveal>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
