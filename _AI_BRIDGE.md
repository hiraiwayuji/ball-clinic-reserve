# AI Documentation & Synchronization Bridge

This file serves as a shared "memory" for all AI assistants (Antigravity, Claude, etc.) working on the `ball-clinic-reserve` project. **Please read this before starting work and update it before finishing.**

---

## 識 Current Project Objective
- **AI Strategy & Data Consistency**: Leveraging the new customer analytics dashboard to generate actionable marketing strategies via AI, while maintaining database-code synchronization.
- **Google Calendar Integration & LINE Integration**: Finalizing remaining integration details for automated communication.

## 笨・Recently Completed (Antigravity)
- [x] **LINE Marketing Automation**: Implemented birthday/segmented coupon delivery and area-based marketing. Added a birthday widget to the admin dashboard.
- [x] **Family Calendar Privacy**: Added `is_shared` flag to events. Implemented profile switching (縺ｼ繝ｼ繧・縺ｾ縺｡) and content filtering in the family calendar.
- [x] **CRM & Analytics Enhancement**: Added city, birth date, and referral source tracking. Implemented a detailed analytics dashboard with 4 interactive charts.
- [x] **Database Sync Fix**: Resolved "Failed to fetch" errors and Supabase CLI "Remote migration versions not found" errors using manual SQL and `migration repair`.
- [x] **AI Secretary Update**: Integrated demographic context into AI advice generation.
- [x] **Production Deployment**: Committed and pushed all changes to GitHub/Vercel; verified production site functionality.

## 圦 In Progress / Current State
- **Stability Monitoring**: Ensuring data consistency across local and production (Vercel) after schema updates.
- **Google Calendar**: Fragments for Server Actions and UI components remain under discussion.

## 盗 Architectural Decisions & Standards
- **Schema**: Adhere strictly to the official schema in `supabase/migrations`.
- **UI**: Premium aesthetics using Vanilla CSS/Tailwind (Shadcn UI patterns).
- **Backend**: Next.js Server Actions for data mutations; Supabase RLS for security.
- **Multi-tenancy**: All queries must consider `clinic_id` as the primary tenant identifier.

## 統 Handover Notes for Other AIs
- **DB Migration Status**: All migrations up to `20260409003000` are applied and synced. If you see schema errors, check `supabase_migrations.schema_migrations`.
- **Deployment**: Vercel auto-deploy is active on the `main` branch.
- **To Claude (Claude Code)**: 
    - The environment is ready. CRM and Analytics features are verified.
    - Please check `_AI_BRIDGE.md` for any new project-level instructions before making schema changes.

---
*Last Updated: 2026-04-09 01:12 (Antigravity)*

