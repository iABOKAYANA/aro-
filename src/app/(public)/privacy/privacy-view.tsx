'use client'

import { useLanguage } from '@/lib/language-context'

export default function PrivacyView() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <div className="container px-4 py-8 md:py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-2xl font-bold sm:text-4xl">{ar ? 'سياسة الخصوصية' : 'Privacy Policy'}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{ar ? 'آخر تحديث: يناير 2026' : 'Last updated: January 2026'}</p>

        <div className="prose prose-lg max-w-none break-words space-y-8">
          <section>
            <h2 className="text-2xl font-bold">{ar ? '1. المعلومات اللي بنجمعها' : '1. Information We Collect'}</h2>
            <p className="text-muted-foreground">
              When you use GHAYA REAL ESTATE, we may collect personal information including your name, email address,
              phone number, and property preferences. We also collect usage data such as search queries, browsing
              patterns, and device information to improve our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '2. بنستخدم معلوماتك إزاي' : '2. How We Use Your Information'}</h2>
            <p className="text-muted-foreground">
              We use your information to provide personalized property recommendations, connect you with developers
              and brokers, process inquiries, and send relevant market updates. Our AI systems analyze your preferences
              to deliver tailored search results and investment insights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '3. مشاركة البيانات' : '3. Data Sharing'}</h2>
            <p className="text-muted-foreground">
              We may share your information with verified developers, brokers, and service providers to fulfill your
              property inquiries. We do not sell your personal data to third parties. All partners are bound by strict
              data protection agreements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '4. حماية البيانات' : '4. Data Security'}</h2>
            <p className="text-muted-foreground">
              We implement industry-standard security measures to protect your personal information, including
              encryption, secure servers, and regular security audits. However, no method of transmission over
              the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '5. حقوقك' : '5. Your Rights'}</h2>
            <p className="text-muted-foreground">
              You have the right to access, correct, or delete your personal data. You can also opt out of marketing
              communications at any time. To exercise these rights, contact us at privacy@estateai.eg.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '6. كلّمنا' : '6. Contact Us'}</h2>
            <p className="text-muted-foreground">
              For questions about this privacy policy, contact us at privacy@estateai.eg or through our contact page.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
