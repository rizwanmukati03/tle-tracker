// lib/satellites.js
export const SATELLITES = [
  { name: "PRSC-EO1", norad: 62726 },
  { name: "PRSC-EO2", norad: 67748 },
  { name: "PRSC-EO3", norad: 68835 },
  { name: "PRSC-S1",  norad: 65055 },
  { name: "HS",       norad: 66054 },
  { name: "PRSS-1",   norad: 43530 },
  { name: "PAKTES-1A", norad: 43529 },
];

export const SAT_LABELS = {
  62726: "EO1", 67748: "EO2", 68835: "EO3",
  65055: "S1",  66054: "HS",  43530: "PRSS-1", 43529: "PAKTES",
};
