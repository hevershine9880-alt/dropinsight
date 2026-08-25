"use client";

/**
 * Chart colours resolve from the same CSS custom properties as the rest of the
 * app, read at render time so charts follow the theme toggle instead of being
 * hard-coded to the light palette.
 */
export function chartColor(token: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || fallback;
}

export const CHART_SERIES = [
  "var(--brand)",
  "var(--positive)",
  "var(--caution)",
  "var(--info)",
  "var(--negative)",
  "var(--color-indigo-300)",
] as const;

export const AXIS_STYLE = {
  fontSize: 11,
  fill: "var(--ink-subtle)",
} as const;

export const GRID_STYLE = {
  stroke: "var(--line)",
  strokeDasharray: "3 4",
} as const;
