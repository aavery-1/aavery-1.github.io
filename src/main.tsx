import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import App from "./App";
import { RootErrorBoundary } from "./errors/RootErrorBoundary";
import { DataProvider } from "./data/DataContext";
import { PasswordGate } from "./auth/PasswordGate";
import { SplashGate } from "./shell/SplashGate";
import { installThemeVariables } from "./theme";
import { installStaleBuildRecovery } from "./errors/staleBuild";
import { muiTheme } from "./muiTheme";
// Carbon's global styles come first so the app's own overrides in styles.css win
// the cascade. This is the real Carbon foundation; MUI's ThemeProvider below is
// temporary scaffolding that is removed once every component is on @carbon/react.
import "./carbon-styles.scss";
import "./styles.css";

installThemeVariables();
// A deploy under an open tab removes the old code chunks; reload into the new
// version instead of showing the error screen (see errors/staleBuild.ts).
installStaleBuildRecovery();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <RootErrorBoundary>
        <PasswordGate>
          <DataProvider>
            <SplashGate />
            <App />
          </DataProvider>
        </PasswordGate>
      </RootErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
