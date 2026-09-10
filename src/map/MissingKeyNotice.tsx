// Specific, friendly setup messages for the three ways the Google base map can
// fail to load. Never a blank page. The sample data is committed and readable at
// /public/data regardless of whether the map renders.

const MESSAGES = {
  "missing-key": {
    title: "Google Maps API key not set",
    body: "The base map needs a Google Maps JavaScript API key. Copy .env.example to .env and paste your key into VITE_GOOGLE_MAPS_API_KEY, then restart the dev server.",
  },
  "auth-error": {
    title: "Google rejected the Maps API key",
    body: "The key loaded but Google refused it. Common causes: the Maps JavaScript API or billing isn't enabled for the project, or an HTTP referrer restriction excludes this origin. Check the Google Cloud console for this key.",
  },
  "network-error": {
    title: "The Google Maps script could not be reached",
    body: "The Maps JavaScript API script failed to load. This is usually a network issue or an ad or script blocker. Check the connection and reload.",
  },
} as const;

export function MissingKeyNotice({ reason }: { reason: keyof typeof MESSAGES }) {
  const m = MESSAGES[reason];
  return (
    <div className="map-root map-setup">
      <div className="card setup-card">
        <h2>{m.title}</h2>
        <p>{m.body}</p>
        <ol className="setup-steps">
          <li>
            Copy <code>.env.example</code> to <code>.env</code>.
          </li>
          <li>
            Set <code>VITE_GOOGLE_MAPS_API_KEY</code> to your key.
          </li>
          <li>
            Restart with <code>npm run dev</code>.
          </li>
        </ol>
        <p className="setup-note">
          The panel, layer toggles, inspector, and tests all work without the base map. The committed sample data is
          readable at <code>/public/data</code>.
        </p>
      </div>
    </div>
  );
}
