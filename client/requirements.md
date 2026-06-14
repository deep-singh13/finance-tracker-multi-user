## Packages
date-fns | Formatting and manipulating dates for the grouped expense list
clsx | Utility for constructing className strings conditionally
tailwind-merge | Utility to merge tailwind classes without style conflicts

## Notes
- Expenses are stored in cents on the backend. The frontend handles conversion: `amount * 100` before sending, and `amount / 100` for display.
- Design is modeled after iOS system apps (Settings, Health) using "Inset Grouped" lists, soft gray backgrounds, and high-contrast white cards.
