import { Utensils, Ticket, Home, Sparkles, Receipt } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type CategoryType = "Food" | "Entertainment" | "Amenities" | "Miscellaneous" | string;

interface CategoryIconProps {
  category: CategoryType;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const CATEGORY_CONFIG: Record<string, { icon: any; colorClass: string }> = {
  Food: { 
    icon: Utensils, 
    colorClass: "bg-orange-500 text-white shadow-orange-500/20" 
  },
  Entertainment: { 
    icon: Ticket, 
    colorClass: "bg-purple-500 text-white shadow-purple-500/20" 
  },
  Amenities: { 
    icon: Home, 
    colorClass: "bg-blue-500 text-white shadow-blue-500/20" 
  },
  Miscellaneous: { 
    icon: Sparkles, 
    colorClass: "bg-zinc-500 text-white shadow-zinc-500/20" 
  },
};

const DEFAULT_CONFIG = {
  icon: Receipt,
  colorClass: "bg-zinc-400 text-white shadow-zinc-400/20"
};

export function CategoryIcon({ category, className, size = "md" }: CategoryIconProps) {
  const config = CATEGORY_CONFIG[category] || DEFAULT_CONFIG;
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: "w-6 h-6 rounded-md",
    md: "w-8 h-8 rounded-lg shadow-sm",
    lg: "w-12 h-12 rounded-xl shadow-md"
  };

  const iconSizes = {
    sm: 12,
    md: 16,
    lg: 24
  };

  return (
    <div className={cn(
      "flex items-center justify-center shrink-0",
      config.colorClass,
      sizeClasses[size],
      className
    )}>
      <Icon size={iconSizes[size]} strokeWidth={2.5} />
    </div>
  );
}

export const CATEGORIES = Object.keys(CATEGORY_CONFIG);
