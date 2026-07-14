# HKA Engine - Agent Instructions and Guidelines

These guidelines are preserved for any AI agent modifying the HKA Engine codebase.

## 1. Point of Sale (POS) Calculations & Discounts

The Point of Sale supports dual-tier concurrent discounts:
1. **Per-Item Discount**:
   - Each item in the cart (`cart` state arrays) can hold an optional `discountValue` (numeric) and `discountType` (`'flat'` or `'percent'`).
   - Flat discount reduces the unit price directly per quantity: $\text{discount} = \text{discountValue} \times \text{quantity}$.
   - Percentage discount reduces the item total price: $\text{discount} = \frac{\text{price} \times \text{quantity} \times \text{discountValue}}{100}$.
   - Summing these gives the `itemDiscountsTotal`.
2. **Invoice-Level Discount**:
   - Applied on the *intermediate subtotal* (gross subtotal minus item discounts total).
   - Can be `'flat'` (USD) or `'percent'` (percentage).
   - Summing both tiers produces the `totalDiscount`.
   - Ensure `total` never goes below `0.00`.

## 2. Responsive UI and Navigation Patterns

- **POS Mobile Experience**:
  - Since the receipt cart requires high screen space, the POS collapses to a custom sliding-tab switch layout on viewport widths below `xl:col-span-5` / standard desktop (`xl`).
  - `mobileTab` state switches views between `'catalog'` and `'cart'`.
  - Adding an item in catalog view triggers an automatic switch to the `'cart'` tab for immediate checkout accessibility.
  - A sliding pill background is used with hardware-accelerated CSS transitions for a premium, non-stiff gesture feel.
