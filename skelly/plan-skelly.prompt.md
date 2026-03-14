## Plan: TypeScript Node + React Skeleton

Create a two-part app in /Users/jason/Documents/git/projects/bodyspace/skelly with an Express TypeScript API and a React + Vite TypeScript frontend, wire frontend-to-API consumption through an environment-driven base URL, and add a VS Code Node debug launch profile for the backend.

**Steps**

1. Phase 1 - Scaffold structure
2. Initialize a root npm project in /Users/jason/Documents/git/projects/bodyspace/skelly to orchestrate scripts for backend/frontend development.
3. Create backend project in server with TypeScript + Express baseline, including tsconfig and scripts for dev/build/start.
4. Create frontend project in client using React + Vite + TypeScript template. This can run in parallel with backend scaffolding.

5. Phase 2 - API and frontend integration
6. Add skeletal backend endpoints (for example health + sample data) under a versioned prefix such as /api.
7. Configure backend CORS for local frontend origin and environment-based port/origin settings.
8. Add frontend API utility that reads VITE_API_BASE_URL and fetches backend endpoints.
9. Wire one basic UI flow in App to display fetched data and minimal loading/error state.
10. Add .env.example files for server and client.

11. Phase 3 - Debug and developer experience
12. Add root scripts for one-command local startup (run server + client) plus separate app scripts.
13. Add .vscode/launch.json profile to launch backend in debug mode with TypeScript source-map support.
14. Ensure backend dev/debug script uses inspect-compatible settings so breakpoints bind reliably.

15. Phase 4 - Verification
16. Install dependencies and confirm successful setup.
17. Start dev mode and verify server and client both run on expected ports.
18. Confirm API endpoint responds directly (browser/curl).
19. Confirm frontend successfully consumes and renders API data.
20. Confirm Node debug profile starts and breakpoints hit in backend route handlers.
21. Confirm production builds for server and client complete.

**Relevant files**

- /Users/jason/Documents/git/projects/bodyspace/skelly/package.json
- /Users/jason/Documents/git/projects/bodyspace/skelly/server/package.json
- /Users/jason/Documents/git/projects/bodyspace/skelly/server/tsconfig.json
- /Users/jason/Documents/git/projects/bodyspace/skelly/server/src/index.ts
- /Users/jason/Documents/git/projects/bodyspace/skelly/server/src/routes/\*.ts
- /Users/jason/Documents/git/projects/bodyspace/skelly/client/package.json
- /Users/jason/Documents/git/projects/bodyspace/skelly/client/vite.config.ts
- /Users/jason/Documents/git/projects/bodyspace/skelly/client/src/App.tsx
- /Users/jason/Documents/git/projects/bodyspace/skelly/client/src/api/\*.ts
- /Users/jason/Documents/git/projects/bodyspace/skelly/client/.env.example
- /Users/jason/Documents/git/projects/bodyspace/skelly/server/.env.example
- /Users/jason/Documents/git/projects/bodyspace/skelly/.vscode/launch.json
- /Users/jason/Documents/git/projects/bodyspace/skelly/.gitignore

**Verification**

1. npm install succeeds for all required projects.
2. npm run dev starts server and frontend without runtime errors.
3. API endpoint returns JSON.
4. Frontend fetch and render path works.
5. VS Code launch profile attaches/launches and breakpoints are hit.
6. npm run build succeeds for backend and frontend.

**Decisions**

- Included scope: TypeScript Express backend, TypeScript React frontend (Vite), API consumption wiring, and VS Code Node debug profile.
- Excluded scope: auth, database, Docker, CI/CD, full automated test suite.
- Architecture choice: separate server/client projects under one root for clean separation with simple local workflow.

Could not persist this to /memories/session/plan.md because session memory requires an active VS Code workspace. Once you open /Users/jason/Documents/git/projects/bodyspace/skelly as the workspace, I can save this plan there immediately and continue refinement.
