'use client'

import { useLanguage } from '@/lib/language-context'

export default function TermsView() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <div className="container px-4 py-8 md:py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-2xl font-bold sm:text-4xl">{ar ? 'شروط الاستخدام' : 'Terms of Service'}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{ar ? 'آخر تحديث: يناير 2026' : 'Last updated: January 2026'}</p>

        <div className="prose prose-lg max-w-none break-words space-y-8">
          <section>
            <h2 className="text-2xl font-bold">{ar ? '1. قبول الشروط' : '1. Acceptance of Terms'}</h2>
            <p className="text-muted-foreground">
              By accessing or using GHAYA REAL ESTATE, you agree to be bound by these Terms of Service. If you do
              not agree with any part of these terms, please do not use our platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '2. استخدام المنصة' : '2. Use of the Platform'}</h2>
            <p className="text-muted-foreground">
              GHAYA REAL ESTATE provides an AI-powered real estate platform for browsing, searching, and inquiring about
              properties in Egypt. You may use the platform for lawful purposes only and must provide accurate
              information when creating an account or submitting inquiries.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '3. الترشيحات بالذكاء الاصطناعي' : '3. AI-Powered Recommendations'}</h2>
            <p className="text-muted-foreground">
              Our AI tools provide property recommendations, price estimates, and market insights based on available
              data. These recommendations are for informational purposes only and should not be considered as
              professional financial or legal advice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '4. حسابات المستخدمين' : '4. User Accounts'}</h2>
            <p className="text-muted-foreground">
              You are responsible for maintaining the confidentiality of your account credentials and for all
              activities that occur under your account. You must notify us immediately of any unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '5. حدود المسؤولية' : '5. Limitation of Liability'}</h2>
            <p className="text-muted-foreground">
              GHAYA REAL ESTATE shall not be liable for any indirect, incidental, or consequential damages arising
              from your use of the platform. Property information is provided by developers and third parties,
              and we do not guarantee its accuracy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '6. تغيير الشروط' : '6. Changes to Terms'}</h2>
            <p className="text-muted-foreground">
              We reserve the right to modify these terms at any time. Changes will be effective upon posting.
              Continued use of the platform constitutes acceptance of the modified terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '7. تواصل معانا' : '7. Contact'}</h2>
            <p className="text-muted-foreground">
              For questions about these terms, contact us at legal@estateai.eg.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
