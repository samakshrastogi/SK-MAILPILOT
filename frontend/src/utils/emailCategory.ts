import type { EmailCategory } from "../types/email";

export function getCategoryLabel(category: EmailCategory) {
  switch (category) {
    case "work":
      return "Work";
    case "personal":
      return "Personal";
    case "spam":
      return "Spam";
    case "finance":
      return "Finance";
    case "promotions":
      return "Promotions";
    case "updates":
      return "Updates";
    default:
      return "Other";
  }
}

export function getCategoryBadgeClass(category: EmailCategory) {
  return `badge--category-${category}`;
}
