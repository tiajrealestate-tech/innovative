# How Trever Rates Write-Ups — Learned From His Reports

Source: 131 rated write-ups extracted from ten of his published Spectora reports
(Pauline Ct, Kirby Rd, W St SE, Midlothian Pl, Frasier Fir Ln, Wilton Oaks Dr,
Terrapin Hills Ct, Prince Frederick Rd, Ivybridge Ct, 303 Charter Oak Ave).
Chip counts were cross-checked against each report's own summary page.

The distilled rules live in `src/lib/houseStyle.ts` / `src/lib/compose.ts` (SEVERITY
RATING section of the compose prompt) — that is what the app actually applies.
This file is the evidence behind those rules; extend it as more reports are shared.

## Distribution

- Recommendation: 91 (~69%) — his default
- Maintenance Item: 29 (~22%)
- Safety Hazard/Major Defects: 11 (~8%) — 0–1 per typical report, 4 max on a heavily-defective house

## The full labeled dataset

### Safety Hazard/Major Defects

- **Active Moisture Intrusion, Water Damage &** — Basements & Crawlspaces *(Pauline Ct)*
- **Hvac System Deficiencies** — Equipment *(Pauline Ct)*
- **Plumbing System Deficiencies** — Plumbing General *(Pauline Ct)*
- **Water Management & Suspected Crawl Space** — Basements & Crawlspaces *(Kirby Rd)*
- **Outdated Detectors (More Than 10 Years Old)** — Smoke Detectors *(Midlothian)*
- **Damaged Stair Tread** — Stairs, Steps, Stoops, Stairways & Ramps *(Terrapin Hills)*
- **Damaged/Broken Window** — Exterior Windows *(Prince Frederick)*
- **Structural Movement Concerns** — Structural General *(Charter Oak)*
- **Water Heater Deficiencies** — Hot Water Systems, Controls, Flues & Ven *(Charter Oak)*
- **Plumbing System Deficiencies** — Plumbing General *(Charter Oak)*
- **Gas Range Safety Hazard** — Range/Oven/Cooktop *(Charter Oak)*

### Maintenance Item

- **Exterior Maintenance Deficiencies** — Exterior General *(Kirby Rd)*
- **Loose Connection At Fixture** — Sinks, Tubs & Showers *(W St SE)*
- **Improper Window Sealing** — Sinks, Tubs & Showers *(W St SE)*
- **Sink, Tub Or Shower Slow To** — Sinks, Tubs & Showers *(Midlothian)*
- **Window Well Cover Missing** — Exterior Windows *(Frasier Fir)*
- **Filter Dirty** — Equipment *(Frasier Fir)*
- **Previous Leaking Cleanout** — Drain, Waste, & Vent Systems *(Frasier Fir)*
- **Strike Plate Misalignment** — Doors *(Frasier Fir)*
- **Missing Door Stopper** — Doors *(Frasier Fir)*
- **Did Not Turn On** — Garbage Disposal *(Frasier Fir)*
- **Vegetation Contacting Structure - Shrubs / Bushes** — Vegetation, Grading, Drainage & Retainin *(Wilton Oaks)*
- **Light Bulb Inoperable** — Switches, Fixtures & Receptacles *(Wilton Oaks)*
- **Unit Not Leveled** — Cooling Equipment *(Terrapin Hills)*
- **Damaged Wall Covering Material** — Siding, Flashing & Trim *(Prince Frederick)*
- **Missing Window Screens** — Exterior Windows *(Prince Frederick)*
- **Filter Dirty** — Equipment *(Prince Frederick)*
- **Toilet Loose Connection To Floor** — Water Supply, Distribution Systems & Fix *(Prince Frederick)*
- **Bulb Missing** — Lighting Fixtures, Switches & Receptacle *(Prince Frederick)*
- **Noticeable Gap** — Doors *(Prince Frederick)*
- **Interior-Keyed Deadbolt** — Doors *(Prince Frederick)*
- **Active Water Leak** — Sinks, Tubs & Showers *(Prince Frederick)*
- **Loose Connection At Fixture** — Sinks, Tubs & Showers *(Prince Frederick)*
- **Aerator Missing/Damaged** — Sinks, Tubs & Showers *(Prince Frederick)*
- **Defect At Mounting Unit** — Dishwasher *(Prince Frederick)*
- **Condensate Drain Line** — Cooling Equipment *(Ivybridge)*
- **Missing/Damaged Window Screen** — Windows *(Ivybridge)*
- **Stopper Missing** — Sinks, Tubs & Showers *(Ivybridge)*
- **Deteriorating Caulking And Discoloration Noted** — Sinks, Tubs & Showers *(Ivybridge)*
- **Cooling System Deficiencies** — Cooling Equipment *(Charter Oak)*

### Recommendation

- **Near End Of Life Expectancy** — Coverings *(Pauline Ct)*
- **Fire Sprinkler System Deficiencies** — Water Supply, Distribution Systems & Fix *(Pauline Ct)*
- **Electrical System Deficiencies** — Main & Subpanels, Service & Grounding, M *(Pauline Ct)*
- **Aging & Inoperable Windows** — Windows *(Pauline Ct)*
- **Prior Water Penetration Observed** — Structural Components & Observations in *(Pauline Ct)*
- **Roofing System** — Coverings *(Kirby Rd)*
- **Hvac Installation & Moisture Concerns** — HVAC General *(Kirby Rd)*
- **Plumbing Deficiencies** — Plumbing General *(Kirby Rd)*
- **Electrical Safety Deficiencies** — Electrical General *(Kirby Rd)*
- **Aging & Defective Windows** — Windows *(Kirby Rd)*
- **Cracked Glass Pane** — Doors *(W St SE)*
- **Prior Water Penetration Observed** — Structural Components & Observations in *(W St SE)*
- **Compromised Party Wall** — Structural Components & Observations in *(W St SE)*
- **Missing Fan** — Bathroom Exhaust Fan / Window *(W St SE)*
- **Roof Coverings Wear Noted** — Coverings *(Midlothian)*
- **Inoperable Light Fixtures** — Lighting Fixtures, Switches & Receptacle *(Midlothian)*
- **Aging Double-Pane Windows** — Windows *(Midlothian)*
- **Previous Water Damage On Ceiling Noted** — Floors, Walls, Ceilings *(Midlothian)*
- **Missing Smoke Detector** — Presence of Smoke and CO Detectors *(Midlothian)*
- **Active Water Leak At Toilet** — Bathroom Toilets *(Midlothian)*
- **Shower Diverter Damaged** — Sinks, Tubs & Showers *(Midlothian)*
- **Deteriorating Caulking And Discoloration Noted** — Sinks, Tubs & Showers *(Midlothian)*
- **Gfci Improperly Wired** — GFCI & Electric in Bathroom *(Midlothian)*
- **Downspouts Drain Too Close To Property** — Roof Drainage Systems *(Frasier Fir)*
- **Loose And Damaged Pavers** — Walkways, Patios & Driveways *(Frasier Fir)*
- **Corrosion** — Hot Water Systems, Controls, Flues & Ven *(Frasier Fir)*
- **Temporary Wiring Used For Permanent Setup** — Branch Wiring Circuits, Breakers & Fuses *(Frasier Fir)*
- **Excessive Noise From Ceiling Fan** — Lighting Fixtures, Switches & Receptacle *(Frasier Fir)*
- **Loose Connection At Fixture** — Sinks, Tubs & Showers *(Frasier Fir)*
- **Sink, Tub Or Shower Slow To Drain** — Sinks, Tubs & Showers *(Frasier Fir)*
- **Deteriorating Caulking And Discoloration Noted** — Sinks, Tubs & Showers *(Frasier Fir)*
- **Cracked Tiles** — Cabinetry, Ceiling, Walls & Floor *(Frasier Fir)*
- **Slow To Drain** — Kitchen Sink *(Frasier Fir)*
- **Burner Not Lighting** — Range/Oven/Cooktop *(Frasier Fir)*
- **Downspouts Drain Too Close To Property** — Roof Drainage Systems *(Wilton Oaks)*
- **Gutter(S) Loose** — Roof Drainage Systems *(Wilton Oaks)*
- **Rotted Wood Trim & Paint Failure On Exterior** — Siding, Flashing & Trim *(Wilton Oaks)*
- **Unsealed Opening** — Siding, Flashing & Trim *(Wilton Oaks)*
- **Substandard Paint Preparation And Finish** — Decks, Balconies, Porches & Steps *(Wilton Oaks)*
- **Service Heat Pump** — Equipment *(Wilton Oaks)*
- **Aging Condenser** — Cooling Equipment *(Wilton Oaks)*
- **Missing Sewer Cleanout Access** — Drain, Waste, & Vent Systems *(Wilton Oaks)*
- **Sewer Scope** — Drain, Waste, & Vent Systems *(Wilton Oaks)*
- **No Expansion Tank** — Hot Water Systems, Controls, Flues & Ven *(Wilton Oaks)*
- **Dated Electrical Panel Noted** — Main & Subpanels, Service & Grounding, M *(Wilton Oaks)*
- **Inspect Chimney, And Sweep If Needed Before Using** — Cleanout Doors & Frames *(Wilton Oaks)*
- **Missing Fireplace Screen** — Cleanout Doors & Frames *(Wilton Oaks)*
- **Damaged Exhaust Connection** — Bathroom Exhaust Fan / Window *(Wilton Oaks)*
- **No Action Needed** — Results *(Wilton Oaks)*
- **Downspouts Drain Too Close To Property** — Roof Drainage Systems *(Terrapin Hills)*
- **Rotted Wood Trim & Paint Failure On Exterior** — Siding, Flashing & Trim *(Terrapin Hills)*
- **Aging Sliding Glass Doors** — Exterior Doors *(Terrapin Hills)*
- **Improper Deck Construction Practices** — Decks, Balconies, Porches & Steps *(Terrapin Hills)*
- **Aging System Observed** — Equipment *(Terrapin Hills)*
- **Corrosion On Main Shut-Off And Supply Lines** — Main Water Shut-o Device *(Terrapin Hills)*
- **Damaged Sewer Cleanout With** — Drain, Waste, & Vent Systems *(Terrapin Hills)*
- **Plumbing Deficiencies** — Water Supply, Distribution Systems & Fix *(Terrapin Hills)*
- **Near End Of Life Expectancy** — Hot Water Systems, Controls, Flues & Ven *(Terrapin Hills)*
- **Temporary Wiring Used For Permanent Setup** — Branch Wiring Circuits, Breakers & Fuses *(Terrapin Hills)*
- **Protective Cover Missing** — Lighting Fixtures, Switches & Receptacle *(Terrapin Hills)*
- **Inspect Chimney, And Sweep If** — Cleanout Doors & Frames *(Terrapin Hills)*
- **Noticeable Gap** — Doors *(Terrapin Hills)*
- **Broken Seal Sliding Glass Door** — Doors *(Terrapin Hills)*
- **Fogged / Broken Seals** — Windows *(Terrapin Hills)*
- **Aging Double-Pane Windows** — Windows *(Terrapin Hills)*
- **Previous Water Damage Evidence** — Floors, Walls, Ceilings *(Terrapin Hills)*
- **Refrigerator Deficiencies** — Refrigerator *(Terrapin Hills)*
- **Downspouts Drain Too Close To Property** — Roof Drainage Systems *(Prince Frederick)*
- **Crawlspace Improvements Recommended** — Basements & Crawlspaces *(Prince Frederick)*
- **Uneven Cooling Performance** — Distribution System *(Prince Frederick)*
- **Tpr Discharge Valve Improper** — Hot Water Systems, Controls, Flues & Ven *(Prince Frederick)*
- **Rust At Electrical Panel** — Main & Subpanels, Service & Grounding, M *(Prince Frederick)*
- **Gfci Not Testing As Functional** — GFCI & Electric in Bathroom *(Prince Frederick)*
- **Near End Of Life Expectancy** — Coverings *(Ivybridge)*
- **Driveway Cracking - Minor** — Walkways, Patios & Driveways *(Ivybridge)*
- **Inspect Chimney, And Sweep If Needed Before Using** — Cleanout Doors & Frames *(Ivybridge)*
- **Active Water Leak** — Clothes Washer *(Ivybridge)*
- **Informe En Español — Haga Clic En El Enlace Abajo** — VER EL INFORME EN ESPAÑOL / VIEW THE SPA *(Charter Oak)*
- **Roof And Chimney Deficiencies** — Roong General *(Charter Oak)*
- **Exterior Concrete Deficiencies** — Walkways, Patios & Driveways *(Charter Oak)*
- **Exterior Stairway And Guardrail Deficiencies** — Decks, Balconies, Porches & Steps *(Charter Oak)*
- **Fence And Gate Deficiencies** — Vegetation, Grading, Drainage & Retainin *(Charter Oak)*
- **Exterior Drainage Deficiencies** — Vegetation, Grading, Drainage & Retainin *(Charter Oak)*
- **Window, Door And Exterior Trim Deficiencies** — Windows & Doors *(Charter Oak)*
- **Basement Walkout Retaining Wall Movement** — Basement Walkout *(Charter Oak)*
- **Basement Moisture Deficiencies** — Basements & Crawlspaces *(Charter Oak)*
- **Wood-Destroying Insect Damage** — Basements & Crawlspaces *(Charter Oak)*
- **Sump Pump Deficiencies** — Sump Pump *(Charter Oak)*
- **Abandoned Electrical Service Wiring** — Service Entrance Conductors *(Charter Oak)*
- **Electrical System Deficiencies** — Main & Subpanels, Service & Grounding, M *(Charter Oak)*
- **Attic Insulation And Moisture Deficiencies** — Structural Components & Observations in *(Charter Oak)*
