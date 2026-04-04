---
name: farmer-buddy
description: Project skill for Farmer Buddy, an agriculture workforce mobile app with RBAC, bodycam streaming, AI summaries, reporting, and an upcoming manager web dashboard.
---

# Farmer Buddy

This skill applies to the Farmer Buddy codebase only.

Farmer Buddy is a production-oriented agriculture operations platform for medium to large farms. The current product is primarily a React Native mobile app, with a manager-focused web dashboard planned next. The app is already partially developed, so the main priorities are stabilization, UI refinement, RBAC hardening, pipeline reliability, and incremental expansion rather than large rewrites.

## Product purpose

Farmer Buddy is an employee monitoring and farm-assistance system.

Core product behavior:
- Employees connect bodycams to their phones and stream work shifts.
- Managers monitor worker activity and review stream-derived summaries.
- Streams are chunked, summarized with Gemini, and turned into usable shift intelligence.
- Managers can generate end-of-shift or end-of-day reports.
- The app also includes agriculture-support tools such as an agronomist chatbot, leaf disease detection, and IoT sensor explainability.

This is not a generic SaaS app. All solutions should stay grounded in agricultural operations, field conditions, workforce visibility, and production safety.

## Current state

Assume the following are true unless updated:
- The mobile app is already substantially built.
- RBAC has been implemented but is not fully reliable.
- The main missing pieces are UI refinement, better production hardening, pipeline improvements, and the manager web dashboard.
- The current UI can be preserved unless explicitly asked to redesign it.
- Prefer improving the existing system over rewriting it.

## User roles

### Manager
Manager capabilities:
- Access all employee streams under their authority.
- View shift summaries and chunk-specific summaries.
- View and generate reports.
- Access manager-level chatbot features related to employee stream data.
- Access agriculture-assistance features.
- Use the future web dashboard.

Manager restrictions:
- Must never be routed into employee-only navigation by mistake.
- Must not lose privileged view because of stale session or bad role hydration.

### Employee
Employee capabilities:
- Start and stop their own stream.
- Access only their own work-session controls.
- Access the agronomist chatbot.
- Access leaf disease detection.
- Access IoT sensor XAI features.

Employee restrictions:
- Cannot access reports.
- Cannot access archived recordings.
- Cannot view other employee streams.
- Cannot access manager dashboards.
- Cannot query organization-wide or cross-employee surveillance data.

### Individual user
Future-compatible role:
- Can use agriculture assistant features only.
- Cannot access bodycam, business monitoring, reports, or manager features.

## RBAC rules

RBAC is critical in this project.

When editing RBAC, authentication, onboarding, or navigation:
- Enforce access at multiple layers, not just UI visibility.
- Do not rely only on hidden buttons or hidden tabs.
- Gate routing, data fetching, mutations, and screen rendering separately.
- Resolve role before rendering role-specific navigation when possible.
- Fail closed, not open; unknown role state should not expose privileged UI.
- Prefer a loading or verification state over flashing the wrong screen.
- Treat any manager/employee screen mismatch as a production bug.

Known issue:
- Sometimes manager sees the employee screen on app load and vice versa.
- Fixes should prioritize session hydration, role resolution order, navigation guards, and stale state cleanup.

## Architecture understanding

Treat the system as four logical layers.

### Layer 1: Client UI
The mobile app shows role-specific views after onboarding and role classification.

Expected role views:
- Manager view: streams, summaries, reports, manager tools.
- Employee view: own streaming controls plus agriculture-support tools.
- Individual user view: agriculture-support tools only.

### Layer 2: Application logic
Main feature modules:
- Bodycam streaming module
- Agronomist chatbot module
- Leaf disease detection
- IoT sensor explainability
- Report generation and shift intelligence
- Future manager web dashboard logic

### Layer 3: Networking and caching
Assume:
- Chunks may be temporarily stored before successful upload.
- Network may be unstable in field environments.
- Chat history may be cached locally.
- Summary results are persisted remotely.
- Deletion should happen only after confirmed success.

### Layer 4: Native hardware
Assume the app may depend on:
- Camera access
- GPS/location access
- Storage access
- IoT-linked data input
- Streaming-related native modules

Any code touching permissions, storage, or background behavior must be defensive and production-safe.

## Stream and summary pipeline

Core flow:
1. Employee starts a work-shift stream.
2. Stream content is chunked on a timed basis.
3. Chunks are temporarily stored and uploaded.
4. Gemini generates short summaries for each chunk.
5. Summaries are saved to Supabase or equivalent persistent storage.
6. Video chunks are deleted only after successful processing and persistence.
7. Manager reviews chunk-level shift summaries.
8. Manager generates a work-shift or workday report.
9. Gemini can synthesize chunk summaries into a richer report.

Report outputs may include:
- Activity distribution
- Important events
- Safety/compliance structures
- Productivity signals
- Shift highlights
- Notable anomalies or incidents

If backend streaming details are unclear, inspect the code first and infer conservatively. Do not invent exact backend behavior.

## Infrastructure assumptions

Assume the project may use:
- React Native / Expo for mobile
- A future web dashboard for managers
- LiveKit or related real-time streaming infrastructure
- Supabase for authentication and persistence
- Gemini for summarization and report synthesis
- Qdrant for RAG or vector retrieval
- DigitalOcean droplet/server infrastructure
- The domain `farmerbuddy.site`

Do not rewrite architecture casually. Extend what already exists unless a prompt clearly asks for structural change.

## Feature guidance

### Agronomist chatbot
- Keep responses agriculture-specific.
- Support farm operations, crops, disease, weather, and field questions.
- Respect role boundaries when using stream-derived context.
- Support multimodal behavior where implemented.

### Leaf disease detection
- Treat this as a practical farm diagnostics feature.
- Keep image capture and upload UX simple.
- Avoid overstating diagnosis certainty.
- Preserve compatibility with Hugging Face Spaces or similar external inference services.

### IoT sensor XAI
- Explain why a sensor result matters in farm terms.
- Prefer understandable explanations over raw technical outputs.
- Make outputs useful for operators and managers, not just ML developers.

### Manager web dashboard
This is a major next-phase addition.

Purpose:
- Managers should monitor many employees more effectively on web than on mobile.
- The dashboard should support live stream oversight, reports, summaries, and manager tools.
- It should reuse existing role logic and backend contracts where possible.

When working on the dashboard:
- Design for manager workflows, not employee workflows.
- Do not assume phone-scale UI.
- Preserve RBAC consistency between mobile and web.

## Engineering rules

When writing Farmer Buddy code:
- Prefer incremental production-safe changes over large rewrites.
- Preserve existing working flows unless the prompt explicitly asks for restructuring.
- Use explicit loading, error, and retry states.
- Keep network operations resumable and idempotent where possible.
- Preserve battery, storage, and connectivity awareness for field use.
- Avoid accidental cross-role data leakage.
- Avoid destructive cleanup before persistence success.
- Keep role-specific navigation and feature gates explicit.

## Priority bug classes

Treat these as high-priority:
1. RBAC routing bugs
2. Role leakage bugs
3. Missing or duplicate chunk summaries
4. Stream/upload inconsistency
5. Report generation failures
6. Manager visibility issues
7. Session hydration and stale auth bugs

## Product versioning mindset

Use this rollout mindset when making decisions.

### v0.x
Stabilize the mobile app:
- RBAC fixes
- Navigation correctness
- Better session handling
- Better upload and summary reliability
- UI cleanup without major redesign

### v1.x
Production mobile operations:
- Stronger reporting
- Better manager visibility into shift data
- Better offline/retry handling
- More reliable field usage

### v2.x
Manager web dashboard:
- Multi-stream monitoring
- Better report viewing
- Manager chatbot integrations
- Web app support for farm operations oversight

### v3.x
Advanced agricultural intelligence:
- Stronger RAG
- Better chatbot context
- Better disease workflows
- More integrated IoT and farm intelligence

When uncertain, choose the smallest safe increment.

## Working style

When responding to Farmer Buddy tasks:
1. Identify whether the task is about mobile stabilization, RBAC, streaming, reporting, agriculture AI, or web dashboard work.
2. Preserve architecture unless change is necessary.
3. Prefer production-safe incremental changes.
4. State assumptions clearly when backend details are uncertain.
5. Explicitly respect role boundaries in every auth-sensitive task.
6. Keep outputs useful for real agricultural operations.

## Output expectations

For this project, generate:
- production-oriented code
- role-safe logic
- maintainable changes
- minimal-risk refactors
- agriculture-aware UX and feature behavior

Do not treat Farmer Buddy as a generic mobile starter app or generic enterprise dashboard.