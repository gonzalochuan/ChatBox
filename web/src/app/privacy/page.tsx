"use client";

import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)] p-6 md:p-12 font-[family-name:var(--font-poppins)]">
      <div className="max-w-3xl mx-auto">
        <header className="mb-12">
          <Link href="/" className="text-emerald-500 font-bold mb-4 inline-block hover:underline">
            ← Back to App
          </Link>
          <h1 className="text-4xl font-black uppercase tracking-tighter font-[family-name:var(--font-geist-sans)] text-emerald-500">
            Privacy Policy
          </h1>
          <p className="mt-2 text-[color:var(--muted)]">Effective Date: March 30, 2026</p>
        </header>

        <section className="space-y-8 leading-relaxed">
          <div>
            <h2 className="text-xl font-bold mb-4 border-l-4 border-emerald-500 pl-4 uppercase tracking-[0.1em] font-[family-name:var(--font-geist-mono)]">
              1. Introduction
            </h2>
            <p>
              Welcome to <strong>ChatBox x SEAIT</strong>. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our application and tell you about your privacy rights and how the law protects you.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-4 border-l-4 border-emerald-500 pl-4 uppercase tracking-[0.1em] font-[family-name:var(--font-geist-mono)]">
              2. Data We Collect
            </h2>
            <p className="mb-4">We may collect, use, store and transfer different kinds of personal data about you which we have grouped together as follows:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Identity Data:</strong> Name, Nickname, Student ID, and Avatar image.</li>
              <li><strong>Contact Data:</strong> Email address.</li>
              <li><strong>Communication Data:</strong> Messages, files, and media shared within the platform.</li>
              <li><strong>Usage Data:</strong> Information about how you use our app and connection mode (LAN/Cloud).</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-4 border-l-4 border-emerald-500 pl-4 uppercase tracking-[0.1em] font-[family-name:var(--font-geist-mono)]">
              3. How We Use Your Data
            </h2>
            <p>
              We only use your data to provide the messaging service, verify your student identity within the SEAIT community, and ensure the security of the intranet communications. We do <strong>NOT</strong> sell your data to third parties.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-4 border-l-4 border-emerald-500 pl-4 uppercase tracking-[0.1em] font-[family-name:var(--font-geist-mono)]">
              4. Data Security
            </h2>
            <p>
              We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorized way, altered or disclosed. Communications are restricted to authorized SEAIT students and staff.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-4 border-l-4 border-emerald-500 pl-4 uppercase tracking-[0.1em] font-[family-name:var(--font-geist-mono)]">
              5. Contact Us
            </h2>
            <p>
              If you have any questions about this privacy policy or our privacy practices, please contact the SEAIT Administration team or the system developer.
            </p>
          </div>
        </section>

        <footer className="mt-20 pt-8 border-t border-white/10 text-center text-sm text-[color:var(--muted-2)]">
          <p>© 2026 ChatBox x SEAIT. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
