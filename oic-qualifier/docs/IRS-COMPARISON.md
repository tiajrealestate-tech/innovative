# IRS pre-qualifier comparison worksheet

Generated from this app's calculator using the 2026-06-29 standards (`npm run control-cases`).
Every case is an eligible individual; unlisted answers are $0. See `scripts/control-cases.ts` for each case's exact inputs.

Enter the same answers at https://www.irs.gov/oictool, fill in the IRS columns, and investigate any material difference before launch.

| # | Case | Debt | Our lump sum | Our periodic | Our result | IRS lump sum | IRS periodic | Match? |
| - | ---- | ---- | ------------ | ------------ | ---------- | ------------ | ------------ | ------ |
| 1 | Single, AL, no assets, low income | $50,000 | $0 | $0 | May not be best |  |  |  |
| 2 | Single, AL, $500/mo left over | $50,000 | $8,000 | $14,000 | May qualify |  |  |  |
| 3 | Single, AL, housing above county standard | $50,000 | $17,400 | $34,800 | May qualify |  |  |  |
| 4 | Couple 65+, FL Miami-Dade, retirement account | $60,000 | $35,792 | $39,584 | May qualify |  |  |  |
| 5 | Family of 4, TX Harris, 2 cars | $45,000 | $10,254 | $14,358 | May qualify |  |  |  |
| 6 | Family of 6, GA Fulton (5+ housing) | $30,000 | $1,080 | $2,160 | May qualify |  |  |  |
| 7 | Single, home with equity | $80,000 | $58,916 | $67,832 | May qualify |  |  |  |
| 8 | Single, underwater home + rental | $70,000 | $45,716 | $59,432 | May qualify |  |  |  |
| 9 | Single, one owned car (exclusion) | $50,000 | $8,666 | $12,782 | May qualify |  |  |  |
| 10 | Single, two owned cars | $50,000 | $18,866 | $21,182 | May qualify |  |  |  |
| 11 | Joint, two owned cars | $50,000 | $25,244 | $37,388 | May qualify |  |  |  |
| 12 | Single, leased car + transit | $50,000 | $7,116 | $14,232 | May qualify |  |  |  |
| 13 | Single, other assets (boat/RV) | $50,000 | $14,136 | $18,252 | May qualify |  |  |  |
| 14 | Single, investments + crypto | $50,000 | $20,316 | $25,632 | May qualify |  |  |  |
| 15 | Single, life insurance cash value | $50,000 | $11,116 | $15,232 | May qualify |  |  |  |
| 16 | Self-employed, CA Los Angeles | $95,000 | $14,316 | $28,632 | May qualify |  |  |  |
| 17 | Offer above debt (small debt) | $6,000 | $8,000 | $14,000 | May not be best |  |  |  |
| 18 | Couple, NY Kings, child support + court order | $55,000 | $39,036 | $78,072 | May qualify |  |  |  |
| 19 | Retiree, AZ Maricopa, pension | $25,000 | $4,680 | $9,360 | May qualify |  |  |  |
| 20 | Single, miscellaneous equity only | $50,000 | $7,000 | $7,000 | May qualify |  |  |  |
