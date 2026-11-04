import { config } from "@/lib/config";
import PrivacyClient from "@/components/PrivacyClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy – ECO Professional DP" };

export default function PrivacyPage() {
  const external = config.aiProvider !== "local";
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-12">
      <PrivacyClient privacyEmail={config.privacyEmail || null} grievanceOfficer={config.grievanceOfficer || null} branches={config.branches} />

      <details className="card mt-8 text-[15px] leading-relaxed" id="notice">
        <summary className="cursor-pointer text-lg font-bold">Privacy Notice – ECO Professional DP Generator (English)</summary>
        <div className="mt-4 flex flex-col gap-3">
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            DRAFT notice version <b>{config.noticeVersion}</b>. This text must be reviewed and approved by ECO Legal before production use.
          </p>
          <h3 className="font-bold">1. Who is responsible</h3>
          <p>ECO Mobility (the “Data Fiduciary”) decides why and how your personal data is processed in this tool.</p>
          <h3 className="font-bold">2. What we collect and why</h3>
          <ul className="list-disc pl-5">
            <li><b>Your photograph</b> – only to create your ECO WhatsApp display picture. Location and other metadata are removed on your phone before upload.</li>
            <li><b>Optional details</b> (category, branch, Employee/Chauffeur ID) – only to measure participation in the WhatsApp Professional Branding Drive. You may skip them.</li>
            <li><b>Participation events</b> – consent given, DP generated, DP downloaded, WhatsApp update confirmed (you confirm this yourself).</li>
          </ul>
          <p>We do not collect your name, phone number, location or any biometric template. No facial recognition, identity matching or biometric identification is performed. A face <i>detector</i> is used only to find where a face is in the photo (for centring and to check that exactly one person is present).</p>
          <h3 className="font-bold">3. How the AI processes your photograph</h3>
          {external ? (
            <p>The cropped photograph is sent over an encrypted (TLS) connection to the approved AI provider ({config.aiProvider}) for background removal. ECO has approved this provider under a written agreement that prohibits training on your photograph and requires deletion after processing.</p>
          ) : (
            <p>The photograph is processed by AI models running on ECO&apos;s own server (person segmentation and face detection). It is <b>not</b> sent to any external AI company and is <b>never</b> used to train AI models.</p>
          )}
          <p>The AI removes the background, applies a uniform brightness/contrast correction and mild sharpening, crops to head-and-shoulders and places the official ECO logo behind you. It does not alter your face, skin tone, age, clothing or accessories.</p>
          <h3 className="font-bold">4. Retention and deletion</h3>
          <ul className="list-disc pl-5">
            <li>Your photograph and the generated DP are processed in server memory only and are discarded as soon as the DP is returned to your phone. They are not written to disk, databases, backups or logs.</li>
            <li>Participation records are deleted automatically {config.participantRetentionDays} days after their last update.</li>
            <li>Consent and withdrawal records are kept for {config.consentLogRetentionDays} days as evidence of consent, then deleted.</li>
            <li>Closed privacy requests are kept for {config.privacyRequestRetentionDays} days, then deleted.</li>
          </ul>
          <h3 className="font-bold">5. Voluntary participation</h3>
          <p>Using this tool is voluntary. You can update your WhatsApp display picture yourself. Not using the tool, or withdrawing consent, has no adverse employment or engagement consequences.</p>
          <h3 className="font-bold">6. Your rights</h3>
          <p>Under the Digital Personal Data Protection Act, 2023 you may: withdraw consent at any time (as easily as you gave it); access a summary of your data; have it corrected, completed or erased; nominate another person to exercise your rights; and raise a grievance. Use the options above or contact us. If you are not satisfied with our response, you may approach the Data Protection Board of India.</p>
          <h3 className="font-bold">7. Security</h3>
          <p>Encrypted transmission (HTTPS), no public storage of photographs, secrets kept server-side only, restricted and audited administrator access, and rate limiting.</p>
          <h3 className="font-bold">8. Contact</h3>
          <p>{config.grievanceOfficer ? <>Grievance Officer: {config.grievanceOfficer}. </> : null}
            {config.privacyEmail ? <>Email: <a className="text-eco underline" href={`mailto:${config.privacyEmail}`}>{config.privacyEmail}</a></> : <i>Privacy contact to be configured by ECO before launch.</i>}</p>
        </div>
      </details>
    </div>
  );
}
