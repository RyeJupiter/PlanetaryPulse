/**
 * GET /api/send-outreach
 * Sends the EarthX2026 outreach email via Resend API.
 *
 * Setup:
 *  1. resend.com → sign up → Add Domain (earthpulse.dev) → copy API key
 *  2. Cloudflare Pages → Settings → Environment Variables → add RESEND_API_KEY
 *  3. Open earthpulse.dev/api/send-outreach in browser — done.
 */

const EMAIL = {
  from: 'Rye@earthpulse.dev',
  to: 'info@earthx.org',
  subject: 'EarthPulse — Making Landscape Regeneration Measurable and Visible | EarthX2026',
  html: `
<div style="font-family:sans-serif;max-width:640px;line-height:1.7;color:#1a1a1a">

<p>Hi EarthX Team,</p>

<p>My name is Rye, and I'm the creator of <strong>EarthPulse</strong> (<a href="https://earthpulse.dev">earthpulse.dev</a>) — a planetary regeneration interface that makes landscape impact on local climate legible, so regeneration can scale with clarity, integrity, and measurable outcomes.</p>

<h3>What EarthPulse Does</h3>

<p>EarthPulse is built on a simple but powerful premise: <em>climate is an emergent property of landscapes</em>. Soils, water, vegetation, and structure determine how energy and moisture move through systems. When land degrades, heat and volatility rise. When land regenerates, cooling, hydration, and resilience return.</p>

<p>The platform gives anyone — practitioners, funders, policymakers, and communities — the tools to see and measure that change:</p>

<ul>
  <li><strong>Interactive 3D Globe</strong> — A live visualization of regeneration projects and Earth metrics across the planet, built with high-resolution satellite imagery.</li>
  <li><strong>Regen Registry</strong> — A geotagged, searchable registry of real regeneration projects stewarded by real people, from Costa Rica mangrove agroforestry to UN WFP Sahel half-moon restoration.</li>
  <li><strong>Local Climatic History</strong> — Query NASA satellite data (MODIS/VIIRS) for any location on Earth: vegetation function (NDVI), land surface temperature (LST), and more — with matched baselines going back to 2001.</li>
  <li><strong>Earth Metrics Dashboard</strong> — Six measurable dimensions of landscape function: hydrology, vegetation, thermal regulation, albedo, aerosols, and resilience — each grounded in peer-reviewed satellite data.</li>
</ul>

<p>The goal is to provide a shared, credible language of ecological change — so regeneration isn't just a story, it's a measurable, verifiable outcome.</p>

<h3>Why EarthX2026</h3>

<p>EarthX is exactly the kind of convening where this platform belongs. At a moment when environmental credibility and measurable outcomes matter more than ever, EarthPulse offers a new frame: regeneration as systems engineering, with the data to back it up.</p>

<p>I'd love to explore how EarthPulse could contribute to EarthX2026 — whether as a speaker session, a demonstration, an exhibit, or a collaboration with other participants working on land, climate, and ecological restoration.</p>

<p><strong>I'd be glad to:</strong></p>
<ul>
  <li>Give a talk or presentation on measuring landscape-climate relationships</li>
  <li>Demo the platform live, including the NASA data explorer</li>
  <li>Connect with regeneration practitioners and funders in your network</li>
  <li>Discuss how EarthPulse can serve as a shared tool for conference participants</li>
</ul>

<p>You can explore the platform now at <strong><a href="https://earthpulse.dev">earthpulse.dev</a></strong>, and I'm happy to schedule a call or send more materials.</p>

<p>Thank you for the extraordinary work EarthX does convening people who care about the planet. I hope there's a place for EarthPulse at EarthX2026.</p>

<p>Warm regards,</p>
<p>
  <strong>Rye</strong><br>
  Creator, EarthPulse<br>
  <a href="mailto:Rye@earthpulse.dev">Rye@earthpulse.dev</a><br>
  <a href="https://earthpulse.dev">earthpulse.dev</a>
</p>

</div>
`,
};

export async function onRequest({ env }) {
  if (!env.RESEND_API_KEY) {
    return Response.json({ ok: false, error: 'RESEND_API_KEY not set in environment variables' }, { status: 500 });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL.from,
      to: EMAIL.to,
      subject: EMAIL.subject,
      html: EMAIL.html,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return Response.json({ ok: false, error: data }, { status: 500 });
  }

  return Response.json({ ok: true, id: data.id, message: `Email sent to ${EMAIL.to}` });
}
