// Which school-card sections are expanded. Progressive disclosure: all start
// closed (the verdict and four figures above them carry the answer); each is
// one click away and the analyst's choice is remembered across schools (and
// reloads, per browser), so
// someone who always reads capacity first sees it open every time.

import { create } from "zustand";

export type InspectorSection =
  | "siting" | "capacity" | "students" | "academics" | "neighborhood" | "drive" | "location" | "news";

// v2: everything starts collapsed (the summary above the sections already
// answers the siting question); the version bump resets older saved states.
const KEY = "soh.inspector.open.v2";
const DEFAULT_OPEN: InspectorSection[] = [];

function read(): Set<InspectorSection> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return new Set(JSON.parse(raw) as InspectorSection[]);
  } catch { /* private mode / blocked storage: fall back to defaults */ }
  return new Set(DEFAULT_OPEN);
}
function write(s: Set<InspectorSection>) {
  try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

interface SectionState {
  open: Set<InspectorSection>;
  toggle: (id: InspectorSection) => void;
  reveal: (id: InspectorSection) => void; // open (never close) and scroll to it
}

export const useInspectorSections = create<SectionState>((set, get) => ({
  open: read(),
  toggle: (id) => {
    const next = new Set(get().open);
    if (next.has(id)) next.delete(id); else next.add(id);
    write(next);
    set({ open: next });
  },
  reveal: (id) => {
    if (!get().open.has(id)) {
      const next = new Set(get().open).add(id);
      write(next);
      set({ open: next });
    }
    // After the accordion expands, bring the section's heading into view.
    window.setTimeout(() => {
      document.getElementById(`insp-sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  },
}));
