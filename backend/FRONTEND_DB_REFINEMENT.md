# Frontend-Driven Database Refinement

This schema is derived from actual frontend pages and `frontend/app.js` local storage usage.

## Page to Collection Mapping

- Student registration/login/dashboard:
  - `users`, `students`
- Advisor registration/login/dashboard:
  - `users`, `advisors`
- Admin registration/login/dashboard:
  - `users`, `admins`
- Student courses page:
  - `courses`, `student_courses`, `semester_setups`
- Student attendance page:
  - `attendance`
- Student CT marks page:
  - `ct_marks`
- Student semester CGPA page:
  - `semester_cgpa`
- Student cumulative CGPA page:
  - reads from `semester_cgpa`
- Admin notices page:
  - `notices`
- Admin assign advisor page:
  - `advisor_assignments` (uses student serial range)
- Student/advisor messaging pages:
  - `messages`

## Implemented Collections

- `users`
- `students`
- `advisors`
- `admins`
- `courses`
- `student_courses`
- `attendance`
- `ct_marks`
- `semester_setups`
- `semester_cgpa`
- `notices`
- `advisor_assignments`
- `messages`

## Why This Is Better

- Keeps authentication data separated from feature data.
- Matches real UI workflows instead of theoretical ER assumptions.
- Supports direct migration from current frontend local storage keys.
- Includes indexes for common lookups and uniqueness constraints.

## Apply to MongoDB

Run from `backend/`:

```bash
npm run db:refine
```

This command creates missing collections and syncs indexes for all models.
