# Tasks

- [x] Backend Implementation
  - [x] Add `Division`, `DivisionMedia`, and enum `DivisionMediaType` to `prisma/schema.prisma`
  - [x] Run Prisma migration and regenerate Prisma Client
  - [x] Create Zod schemas in `divisions.validation.ts` with position validations (Images: 1-3, Videos: 4-5)
  - [x] Implement CRUD and public controllers in `divisions.controller.ts` with exact selective public fields and Drive cleaning on update/delete
  - [x] Configure Express routes in `divisions.routes.ts`
  - [x] Mount routes in `src/routes/index.ts`
  - [x] Write integration tests in `divisions-crud-integration.ts`
  - [x] Register test suite in `src/tests/run-all-tests.ts`
  - [x] Verify backend compilation (`npm run build`)
  - [x] Run all backend tests (`npm run test`)
