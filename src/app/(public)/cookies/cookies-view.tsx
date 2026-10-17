'use client'

import { useLanguage } from '@/lib/language-context'

export default function CookiesView() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <div className="container px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-4xl font-bold">{ar ? 'سياسة الكوكيز' : 'Cookie Policy'}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{ar ? 'آخر تحديث: يناير 2026' : 'Last updated: January 2026'}</p>

        <div className="prose prose-lg max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold">{ar ? '1. يعني إيه كوكيز' : '1. What Are Cookies'}</h2>
            <p className="text-muted-foreground">
              Cookies are small text files stored on your device when you visit our website. They help us
              provide a better browsing experience by remembering your preferences and settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '2. أنواع الكوكيز اللي بنستخدمها' : '2. Types of Cookies We Use'}</h2>
            <div className="text-muted-foreground space-y-3">
              <p><strong>Essential Cookies:</strong> Required for the platform to function properly, including
              authentication, session management, and security features.</p>
              <p><strong>Preference Cookies:</strong> Remember your language preference (Arabic/English),
              theme settings (dark/light), and search filters.</p>
              <p><strong>Analytics Cookies:</strong> Help us understand how visitors interact with our platform,
              allowing us to improve the user experience.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '3. التحكم في الكوكيز' : '3. Managing Cookies'}</h2>
            <p className="text-muted-foreground">
              You can control cookie settings through your browser preferences. You may choose to block all
              cookies, accept all cookies, or notify you when a cookie is set. Note that disabling certain
              cookies may affect platform functionality.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '4. كوكيز الطرف التالت' : '4. Third-Party Cookies'}</h2>
            <p className="text-muted-foreground">
              Some cookies are placed by third-party services that appear on our pages, such as map providers
              and analytics services. We do not control these third-party cookies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '5. التحديثات' : '5. Updates'}</h2>
            <p className="text-muted-foreground">
              We may update this cookie policy from time to time. Any changes will be posted on this page
              with an updated revision date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold">{ar ? '6. تواصل معانا' : '6. Contact'}</h2>
            <p className="text-muted-foreground">
              For questions about our cookie policy, contact us at privacy@estateai.eg.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
