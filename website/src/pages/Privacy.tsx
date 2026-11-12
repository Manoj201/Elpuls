import styles from "./Privacy.module.css";

/**
 * Ported from the full draft at CLAUDE's Privacy Policy doc
 * (https://claude.ai/artifact/D3FNoLC54UPgp1xkLPCQgk). Edit that doc or
 * this file — whichever you touch, copy the change into the other so they
 * don't drift.
 */
export function Privacy() {
  return (
    <div className={styles.wrap}>
      <div className={`container ${styles.prose}`}>
        <h1>Elpuls Privacy Policy</h1>
        <span className={styles.updated}>Last updated: 2026-11-12</span>

        <h2>Overview</h2>
        <p>
          Elpuls ("Elpuls", "we", "us") is a mobile app for Swedish households
          that shows electricity spot prices, explains why they move using
          weather data, and suggests when to use electricity. Elpuls never
          controls or switches your electricity contract, and it never connects
          to or controls any smart-home device — all advice is informational,
          acted on manually by you.
        </p>
        <p>
          This policy explains what personal data Elpuls collects, why, who it's
          shared with, how long it's kept, and the rights you have over it. It
          applies to the Elpuls mobile app and this website.
        </p>

        <h2>Data We Collect</h2>
        <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Collected when</th>
              <th>Required?</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Anonymous account ID</td>
              <td>Always, automatically, on first app open</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>Email + password</td>
              <td>
                Only if you choose to create an account instead of continuing
                anonymously
              </td>
              <td>No</td>
            </tr>
            <tr>
              <td>
                Price zone, heating type, EV/solar flags, grid fee figures
              </td>
              <td>Onboarding or Settings</td>
              <td>No, but needed for personalized advice</td>
            </tr>
            <tr>
              <td>Estimated monthly usage, price-alert thresholds, language</td>
              <td>Settings, optional</td>
              <td>No</td>
            </tr>
            <tr>
              <td>Appliance rating-label photo, electricity bill photo/PDF</td>
              <td>Only if you choose to scan one</td>
              <td>No, you can enter values manually instead</td>
            </tr>
            <tr>
              <td>Push notification token</td>
              <td>Only if you enable notifications</td>
              <td>No</td>
            </tr>
            <tr>
              <td>Subscription/trial status</td>
              <td>When you start a Pro trial or subscribe</td>
              <td>No</td>
            </tr>
          </tbody>
        </table>
        </div>
        <p>
          We don't collect precise location, contacts, photos beyond what you
          deliberately upload to scan, or any data from your device beyond
          what's listed above.
        </p>

        <h2>How We Use Your Data</h2>
        <ul>
          <li>
            Personalize the price explainer, solar bonus hours, heating plan,
            weather-prep tips, and appliance cost recommendations to your zone
            and home profile
          </li>
          <li>
            Send the push notifications you've opted into (tomorrow's prices
            published, your price-alert thresholds, daily briefing,
            appliance-window reminders)
          </li>
          <li>
            Read an appliance or bill photo you upload once, to fill in a value
            for you to confirm or edit — never saved automatically
          </li>
          <li>Manage your Pro subscription and free trial status</li>
          <li>Diagnose bugs and keep the app running reliably</li>
        </ul>
        <p>
          Elpuls does not sell your personal data, and does not show third-party
          advertising.
        </p>

        <h2>Third Parties We Share Data With</h2>
        <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Service</th>
              <th>What it receives</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Firebase / Google Cloud</td>
              <td>Account ID, profile data, push token</td>
              <td>Authentication, database, serverless backend, diagnostics</td>
            </tr>
            <tr>
              <td>Anthropic (Claude API)</td>
              <td>
                An appliance or bill photo/PDF, only when you choose to scan one
              </td>
              <td>
                Reads the label/line items; processed for that one request, not
                stored by Elpuls afterward
              </td>
            </tr>
            <tr>
              <td>RevenueCat</td>
              <td>Account ID, subscription/entitlement status</td>
              <td>Manages your Pro subscription and trial</td>
            </tr>
            <tr>
              <td>Expo</td>
              <td>Push notification token</td>
              <td>Delivers push notifications to your device</td>
            </tr>
            <tr>
              <td>elprisetjustnu.se (Nord Pool) / SMHI</td>
              <td>
                Nothing personal — Elpuls only reads their public price and
                weather data
              </td>
              <td>Powers the price and weather features for everyone</td>
            </tr>
          </tbody>
        </table>
        </div>
        <p className={styles.placeholder}>
          Confirm each vendor's actual Data Processing Agreement before
          publishing this policy.
        </p>

        <h2>Data Retention</h2>
        <ul>
          <li>
            <strong>Appliance and bill photos/PDFs</strong>: processed in memory
            for a single request and discarded immediately after — never written
            to any storage.
          </li>
          <li>
            <strong>Account and profile data</strong>: kept while your account
            exists.
          </li>
          <li>
            <strong>Push token</strong>: kept while notifications are enabled;
            removed when you disable them or stop using the app.
          </li>
          <li>
            <strong>Price and weather data</strong>: aggregate, zone-level, not
            personal — kept indefinitely to power the app.
          </li>
        </ul>
        <p className={styles.placeholder}>
          Open gap to fix before publishing: add a self-serve "delete my
          account" action in the app, or clearly state the contact address for
          deletion requests — GDPR's right to erasure requires an actual way to
          exercise it.
        </p>

        <h2>Your Rights (GDPR)</h2>
        <p>As an EU/Swedish user, you have the right to:</p>
        <ul>
          <li>
            <strong>Access</strong> the personal data we hold about you
          </li>
          <li>
            <strong>Correct</strong> inaccurate data
          </li>
          <li>
            <strong>Erase</strong> your data ("right to be forgotten")
          </li>
          <li>
            <strong>Export</strong> your data in a portable format
          </li>
          <li>
            <strong>Object to or restrict</strong> certain processing
          </li>
          <li>
            <strong>Lodge a complaint</strong> with IMY
            (Integritetsskyddsmyndigheten), Sweden's data protection authority,
            at imy.se
          </li>
        </ul>
        <p>
          You can edit your zone, heating type, grid fee, and appliances
          directly in the app's Settings at any time. For anything else —
          including full account deletion — contact us at{" "}
          <span className={styles.placeholder}>
            privacy@elpuls.com (placeholder)
          </span>
          .
        </p>

        <h2>Children's Privacy</h2>
        <p>
          Elpuls is for adults only. You must be 18 or older to create an
          account and use the app. We do not knowingly collect personal data
          from anyone under 18. If we learn that a user is under 18, we will
          close their account and delete their data.
        </p>

        <h2>International Data Transfers</h2>
        <p>
          Firebase/Google Cloud, Anthropic, RevenueCat, and Expo may process
          data on servers outside Sweden or the EU, including in the United
          States. Where that happens, these providers rely on safeguards such as
          Standard Contractual Clauses to meet GDPR's requirements for transfers
          outside the EU/EEA.
        </p>
        <p className={styles.placeholder}>
          This section is a placeholder — confirm each vendor's actual transfer
          mechanism before publishing.
        </p>

        <h2>Changes to This Policy</h2>
        <p>
          If we change this policy in a meaningful way, we'll update the "last
          updated" date above and, for significant changes, notify you in the
          app. Continuing to use Elpuls after a change means you accept the
          updated policy.
        </p>

        <h2>Contact Us</h2>
        <p>
          Elpuls is developed and operated by an individual, not a registered
          company. Manoj Gamachchige, trading as Elpuls, is the data
          controller for GDPR purposes.
        </p>
        <p className={styles.placeholder}>
          privacy@elpuls.com — placeholder, set up once the domain is live
        </p>
        <p>
          For any question about this policy or your data, or to request access,
          correction, or deletion, contact us at the address above.
        </p>
      </div>
    </div>
  );
}
