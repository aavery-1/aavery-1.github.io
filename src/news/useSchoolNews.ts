// Live headlines for one school, for the inspector's "In the news" card. Fetches
// from the Supabase `school-news` Edge Function (see supabaseClient.fetchSchoolNews)
// and FAILS SOFT, mirroring useDriveTime: if Supabase is not configured it reports
// "unavailable", and a transport/function error reports "error", so the inspector
// never breaks over a missing or flaky feed.

import { useEffect, useRef, useState } from "react";
import { fetchSchoolNews, newsConfigured } from "../auth/supabaseClient";
import type { NewsItem } from "./parseGoogleNews";

export type SchoolNews =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; items: NewsItem[] } // items may be empty (no headlines matched)
  | { status: "unavailable" }           // Supabase/news not configured
  | { status: "error" };

export function useSchoolNews(name: string | null): SchoolNews {
  const [state, setState] = useState<SchoolNews>({ status: "idle" });
  const reqId = useRef(0);

  useEffect(() => {
    if (!name) {
      setState({ status: "idle" });
      return;
    }
    if (!newsConfigured) {
      setState({ status: "unavailable" });
      return;
    }
    const myReq = ++reqId.current;
    setState({ status: "loading" });
    fetchSchoolNews(name, 6)
      .then((items) => {
        if (myReq !== reqId.current) return; // a newer school superseded this fetch
        setState({ status: "ok", items });
      })
      .catch((err: unknown) => {
        if (myReq !== reqId.current) return;
        setState({ status: err instanceof Error && err.message === "news-unconfigured" ? "unavailable" : "error" });
      });
  }, [name]);

  return state;
}
