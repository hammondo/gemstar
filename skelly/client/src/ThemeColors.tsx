const colors = [
  { token: "warm-50", hex: "#ffffff", usage: "Input backgrounds" },
  { token: "warm-100", hex: "#F6EEEC", usage: "Page background (body)" },
  { token: "warm-200", hex: "#eeddd8", usage: "Borders, dividers" },
  { token: "teal-300", hex: "#b9eae7", usage: "Light accents, hover tints" },
  {
    token: "teal-400",
    hex: "#6fcacb",
    usage: "Primary buttons, active highlights, progress bars",
  },
  { token: "teal-600", hex: "#3895a1", usage: "Mid-tone teal accent" },
  {
    token: "teal-700",
    hex: "#00627b",
    usage: "Headings, hashtag text, dark accent",
  },
  { token: "teal-900", hex: "#223131", usage: "Deep contrast" },
  { token: "charcoal", hex: "#223131", usage: "Hero header text" },
  { token: "muted", hex: "#555555", usage: "Secondary / body text" },
  {
    token: "ok",
    hex: "#6fcacb",
    usage: "Success badges (published, approved)",
  },
  {
    token: "warn",
    hex: "#b87333",
    usage: "Warning badges (pending_review, scheduled)",
  },
  { token: "bad", hex: "#c25050", usage: "Error badges (rejected)" },
];

function contrastText(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 160 ? "#223131" : "#ffffff";
}

export default function ThemeColors() {
  return (
    <div className="mx-auto my-8 grid w-[min(900px,92vw)] gap-4">
      <header className="rounded-2xl border border-warm-200 bg-white p-7 shadow-sm">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-teal-700">
          Design System
        </p>
        <h1 className="m-0 font-heading text-[clamp(1.5rem,2.8vw,2.4rem)] leading-tight text-charcoal">
          Theme Colours
        </h1>
        <p className="mt-3 max-w-[74ch] text-muted">
          All colour tokens defined in the Tailwind v4 <code>@theme</code>{" "}
          block, aligned to the BodySpace Recovery Studio brand.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-warm-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-warm-200 bg-warm-100 text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="px-4 py-3">Swatch</th>
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3">Hex</th>
              <th className="px-4 py-3">Usage</th>
            </tr>
          </thead>
          <tbody>
            {colors.map((c) => (
              <tr
                key={c.token}
                className="border-b border-warm-200 last:border-b-0"
              >
                <td className="px-4 py-3">
                  <div
                    className="h-10 w-10 rounded-lg border border-warm-200 shadow-sm"
                    style={{ backgroundColor: c.hex }}
                    title={c.hex}
                  />
                </td>
                <td className="px-4 py-3">
                  <code
                    className="rounded px-1.5 py-0.5 text-xs font-semibold"
                    style={{
                      backgroundColor: c.hex,
                      color: contrastText(c.hex),
                      border: `1px solid ${c.hex === "#ffffff" ? "#eeddd8" : c.hex}`,
                    }}
                  >
                    {c.token}
                  </code>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">
                  {c.hex}
                </td>
                <td className="px-4 py-3 text-muted">{c.usage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-warm-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-heading text-charcoal">Fonts</h2>
        <p className="text-muted">
          <strong>Poppins</strong> (400 / 500 / 600 / 700) via Google Fonts —
          applied as <code>--font-heading</code> and <code>--font-body</code>.
        </p>
        <div className="mt-4 grid grid-cols-4 gap-3 max-sm:grid-cols-2">
          {[400, 500, 600, 700].map((w) => (
            <div
              key={w}
              className="rounded-lg border border-warm-200 p-3 text-center"
            >
              <p className="text-2xl text-charcoal" style={{ fontWeight: w }}>
                Aa
              </p>
              <p className="mt-1 text-xs text-muted">{w}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
