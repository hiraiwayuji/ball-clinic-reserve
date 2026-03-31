-- Add members column to calendars table
ALTER TABLE IF EXISTS public.calendars ADD COLUMN IF NOT EXISTS members JSONB;

-- Initialize members for existing calendars if they don't have it
-- Using the default MEMBERS from the frontend code as a baseline
UPDATE public.calendars 
SET members = '[
  { "name": "パパ",    "color": "#ef4444", "bg": "bg-red-500",    "light": "bg-red-100",    "text": "text-red-700"    },
  { "name": "ママ",    "color": "#ec4899", "bg": "bg-pink-500",   "light": "bg-pink-100",   "text": "text-pink-700"   },
  { "name": "子ども1", "color": "#3b82f6", "bg": "bg-blue-500",   "light": "bg-blue-100",   "text": "text-blue-700"   },
  { "name": "子ども2", "color": "#22c55e", "bg": "bg-green-500",  "light": "bg-green-100",  "text": "text-green-700"  },
  { "name": "家族",    "color": "#f59e0b", "bg": "bg-amber-500",  "light": "bg-amber-100",  "text": "text-amber-700"  },
  { "name": "試合",    "color": "#dc2626", "bg": "bg-red-600",    "light": "bg-red-50",     "text": "text-red-600", "border": "border-red-600" },
  { "name": "その他",  "color": "#8b5cf6", "bg": "bg-violet-500", "light": "bg-violet-100", "text": "text-violet-700" }
]'::jsonb
WHERE members IS NULL;
