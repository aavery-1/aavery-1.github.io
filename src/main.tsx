import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { RootErrorBoundary } from "./errors/RootErrorBoundary";
import { DataProvider } from "./data/DataContext";
import { PasswordGate } from "./auth/PasswordGate";
import { SplashGate } from "./shell/SplashGate";
import { installThemeVariables } from "./theme";
import { installStaleBuildRecovery } from "./errors/staleBuild";
// Carbon's global styles come first so the app's own overrides in styles.css win
// the cascade. This is the real Carbon foundation; every component is on
// @carbon/react or plain elements styled with Carbon tokens.
import "./carbon-styles.scss";
import "./styles.css";

installThemeVariables();
// A deploy under an open tab removes the old code chunks; reload into the new
// version instead of showing the error screen (see errors/staleBuild.ts).
installStaleBuildRecovery();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <PasswordGate>
        <DataProvider>
          <SplashGate />
          <App />
        </DataProvider>
      </PasswordGate>
    </RootErrorBoundary>
  </StrictMode>,
);
