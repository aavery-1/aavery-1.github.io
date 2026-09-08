import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import App from "./App";
import { RootErrorBoundary } from "./errors/RootErrorBoundary";
import { DataProvider } from "./data/DataContext";
import { installThemeVariables } from "./theme";
import { muiTheme } from "./muiTheme";
import "./styles.css";

installThemeVariables();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <RootErrorBoundary>
        <DataProvider>
          <App />
        </DataProvider>
      </RootErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
