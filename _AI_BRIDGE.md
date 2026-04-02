# AI Documentation & Synchronization Bridge

This file serves as a shared "memory" for all AI assistants (Antigravity, Claude, etc.) working on the `ball-clinic-reserve` project. **Please read this before starting work and update it before finishing.**

---

## 🎯 Current Project Objective
- **Google Calendar Integration & Multi-tenancy Consistency**: Finalizing the integration of Google Calendar while ensuring all database queries and UI components are resilient to multi-tenancy (using `clinic_id`).
- **LINE Integration**: Setting up and testing the LINE Messaging API for clinic-to-customer communication.

## ✅ Recently Completed (Antigravity)
- [x] **Build Fixes**: Resolved syntax errors and redundant tags in `src/app/reserve/page.tsx`.
- [x] **Schema Research**: Identified `ai_memos` and `ai_blog_proposals` tables for AI-driven features.
- [x] **Infrastructure**: Established this `_AI_BRIDGE.md` for cross-AI synchronization.
- [x] **Claude Code Setup**: Installed Anthropic Claude Code CLI (v2.1.90).
- [x] **Handover (LINE)**: Integrated LINE Test User ID and testing instructions.

## 🚧 In Progress / Current State
- **LINE Integration**: 
    - **Test User ID**: `U1236495734df25789d98f15d7b2b3b46`
    - **Method**: Use `sendAppointmentReminders` in `line-marketing.ts`.
    - **Env Var**: `TEST_LINE_USER_ID` should be set in Vercel.
- **Google Calendar**: Fragments for Server Actions and UI components have been requested/discussed.
- **Multi-tenancy**: Dashboard access has been made resilient to missing `clinic_id` columns during migration.

## 📐 Architectural Decisions & Standards
- **Schema**: Adhere strictly to the official schema in `supabase/migrations`.
- **UI**: Premium aesthetics using Vanilla CSS/Tailwind (Shadcn UI patterns).
- **Backend**: Next.js Server Actions for data mutations; Supabase RLS for security.
- **Multi-tenancy**: All queries must consider `clinic_id` as the primary tenant identifier.

## 📝 Handover Notes for Other AIs
- If you are **Claude (Claude Code)**: 
    - The CLI is installed at `C:\Users\hirai\.local\bin\claude.exe`.
    - You may need to run `claude` once to authenticate if the session is not inherited.
    - Update the "Current Objective" or "In Progress" section when you take over a task. 
- **Wait for Input**: We are currently in the process of finalizing the Google Calendar logic using shared snippets.

---
*Last Updated: 2026-04-03 00:26 (Antigravity)*
