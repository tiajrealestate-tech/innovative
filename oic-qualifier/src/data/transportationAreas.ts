// Which IRS transportation areas to offer for each state. This holds names
// only; every dollar amount comes from the standards JSON. The IRS groups
// states by Census region, and each named metro lists the states that have
// counties inside it. The user always picks the final area.

export type Region = "Northeast" | "Midwest" | "South" | "West";

export const stateRegion: Record<string, Region> = {
  Connecticut: "Northeast", Maine: "Northeast", Massachusetts: "Northeast",
  "New Hampshire": "Northeast", "New Jersey": "Northeast", "New York": "Northeast",
  Pennsylvania: "Northeast", "Rhode Island": "Northeast", Vermont: "Northeast",
  Illinois: "Midwest", Indiana: "Midwest", Iowa: "Midwest", Kansas: "Midwest",
  Michigan: "Midwest", Minnesota: "Midwest", Missouri: "Midwest", Nebraska: "Midwest",
  "North Dakota": "Midwest", Ohio: "Midwest", "South Dakota": "Midwest", Wisconsin: "Midwest",
  Alabama: "South", Arkansas: "South", Delaware: "South", "District of Columbia": "South",
  Florida: "South", Georgia: "South", Kentucky: "South", Louisiana: "South",
  Maryland: "South", Mississippi: "South", "North Carolina": "South", Oklahoma: "South",
  "South Carolina": "South", Tennessee: "South", Texas: "South", Virginia: "South",
  "West Virginia": "South",
  Alaska: "West", Arizona: "West", California: "West", Colorado: "West", Hawaii: "West",
  Idaho: "West", Montana: "West", Nevada: "West", "New Mexico": "West", Oregon: "West",
  Utah: "West", Washington: "West", Wyoming: "West",
};

export const metroStates: Record<string, string[]> = {
  Boston: ["Massachusetts", "New Hampshire"],
  "New York": ["New York", "New Jersey", "Pennsylvania", "Connecticut"],
  Philadelphia: ["Pennsylvania", "New Jersey", "Delaware", "Maryland"],
  Chicago: ["Illinois", "Indiana", "Wisconsin"],
  Cleveland: ["Ohio"],
  Detroit: ["Michigan"],
  "Minneapolis-St. Paul": ["Minnesota", "Wisconsin"],
  "St. Louis": ["Missouri", "Illinois"],
  Atlanta: ["Georgia"],
  Baltimore: ["Maryland"],
  "Dallas-Ft. Worth": ["Texas"],
  Houston: ["Texas"],
  Miami: ["Florida"],
  Tampa: ["Florida"],
  "Washington, D.C.": ["District of Columbia", "Maryland", "Virginia", "West Virginia"],
  Anchorage: ["Alaska"],
  Denver: ["Colorado"],
  Honolulu: ["Hawaii"],
  "Los Angeles": ["California"],
  Phoenix: ["Arizona"],
  "San Diego": ["California"],
  "San Francisco": ["California"],
  Seattle: ["Washington"],
};
