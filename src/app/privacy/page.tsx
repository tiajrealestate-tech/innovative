// Privacy policy — required by the Chrome Web Store listing, and true.
export const metadata = { title: "Privacy Policy — HyperReports AI" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-12 text-gray-800 text-sm leading-relaxed">
        <h1 className="text-2xl font-semibold mb-1">Privacy Policy</h1>
        <p className="text-gray-500 mb-8">
          HyperReports AI browser extension · Last updated August 2026
        </p>

        <h2 className="font-semibold text-base mt-6 mb-2">What the extension does</h2>
        <p>
          The HyperReports AI extension helps a licensed home inspector build
          inspection reports in their report-writing software (Spectora). It
          checks checkboxes and places written comments that the inspector
          created and approved in the HyperReports web application.
        </p>

        <h2 className="font-semibold text-base mt-6 mb-2">What data it handles</h2>
        <p>
          The extension stores the inspector&apos;s own report content (a
          checkbox list and written comments) in the browser&apos;s local
          extension storage, so it can be placed into the report editor. This
          data is created by the inspector, belongs to the inspector, and moves
          only between two tabs inside the inspector&apos;s own browser: the
          HyperReports web app and the report editor.
        </p>

        <h2 className="font-semibold text-base mt-6 mb-2">What it does NOT do</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>It does not send any data to the extension developer or any third party.</li>
          <li>It does not collect analytics, telemetry, or usage data.</li>
          <li>It does not read, collect, or transmit browsing history.</li>
          <li>It does not sell or share any data with anyone.</li>
          <li>It runs only on the report editor and the HyperReports app — no other sites.</li>
        </ul>

        <h2 className="font-semibold text-base mt-6 mb-2">Data retention</h2>
        <p>
          Stored report content stays in local browser storage until it is
          replaced by the next report or cleared with the extension&apos;s
          &ldquo;Clear loaded data&rdquo; button. Uninstalling the extension
          removes it entirely.
        </p>

        <h2 className="font-semibold text-base mt-6 mb-2">Contact</h2>
        <p>
          Questions about this policy: tiaj.realestate@gmail.com
        </p>
      </div>
    </main>
  );
}
