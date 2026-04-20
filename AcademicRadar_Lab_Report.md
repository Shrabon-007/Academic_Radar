# Internet Programming (Sessional) [CSE-326]
## Front End Lab Report on: Academic Radar System

### Submitted By
- Name: ____________________
- Student ID: ____________________
- Section/Batch: ____________________

### Submitted To
- Course Teacher: ____________________
- Department of Computer Science and Engineering
- Chittagong University of Engineering & Technology (CUET)

---

## 1 Objectives
- To build a centralized web-based front-end for student academic monitoring.
- To support role-based workflows for Student, Advisor, and Admin users.
- To simplify course, attendance, CT marks, and CGPA tracking.
- To enable advisor-student communication for feedback and risk intervention.
- To provide administrative tools for publishing notices and advisor assignment.

## 2 Introduction
In this project, HTML, CSS, and JavaScript are used to develop a responsive, role-based academic management interface named Academic Radar.

### HTML (HyperText Markup Language)
HTML is used to create the structure of all pages, including role dashboards, forms, tables, and navigation.

### CSS (Cascading Style Sheets)
CSS is used to define the visual design system of the project, including a mint-themed color palette, card layout, responsive grids, badges, and typography.

### JavaScript
JavaScript handles dynamic behavior such as login/register flow, local data persistence with browser storage, attendance and CT mark calculations, advisor ranking updates, messaging, and notice management.

## 3 Front End Design

### 3.1 Use Case Diagram
The use case model shows three actors: Student, Advisor, and Admin. It captures key interactions such as login, dashboard access, course management, attendance tracking, CT marks entry, messaging, performance monitoring, and user management.

![Figure 1: Use Case Diagram](WhatsApp%20Image%202026-04-15%20at%2004.56.23.jpeg)

### 3.2 Activity Diagram
The activity flow demonstrates how users authenticate, access role-specific features, and interact with system services such as data loading/storing, CGPA calculation, feedback exchange, and notice/advisor management.

![Figure 2: Activity Diagram](WhatsApp%20Image%202026-04-15%20at%2004.52.32.jpeg)

### 3.3 ER Diagram
The ER diagram defines entities and relationships used by the project design: USER, STUDENT, ADVISOR, ADMIN, COURSE, ATTENDANCE, CT_MARKS, ENROLLMENT, SEMESTER_CGPA, MESSAGE, and NOTICE.

![Figure 3: ER Diagram (Conceptual)](WhatsApp%20Image%202026-04-15%20at%2005.08.41.jpeg)

![Figure 4: ER Diagram (Refined with PK/FK)](WhatsApp%20Image%202026-04-15%20at%2005.12.41.jpeg)

### 3.4 Role and Feature Summary
- Student:
  - Login/Register
  - View dashboard
  - Manage courses
  - Track attendance
  - Enter/view CT marks
  - View semester and cumulative CGPA
  - Send messages to advisor
- Advisor:
  - View dashboard and reports
  - View student ranking
  - Reply to student messages
  - Send warning messages in danger zone
- Admin:
  - Manage dashboard
  - Publish notices
  - Assign advisors

## 4 Core Structure

### 4.1 HTML Page Organization
The project contains separate pages for each role and feature module.

#### Common/Auth Pages
- login.html
- admin-login.html
- advisor-login.html
- student-login.html
- admin-register.html
- advisor-register.html
- student-register.html

#### Admin Pages
- admin-dashboard.html
- admin-notices.html
- admin-assign-advisor.html

#### Advisor Pages
- advisor-dashboard.html
- advisor-messages.html
- advisor-student-ranking.html
- advisor-student-profile.html
- advisor-danger-zone.html

#### Student Pages
- student-dashboard.html
- student-courses.html
- student-attendance.html
- student-ct-marks.html
- student-semester-cgpa.html
- student-cumulative-cgpa.html
- student-message-advisor.html

### 4.2 CSS Design System
The stylesheet applies:
- CSS variables for theme colors, borders, card backgrounds, and shadows.
- Reusable layout utilities like grid, row, and card classes.
- Role badges, stat cards, alerts, and responsive behavior for smaller screens.

Main style file:
- styles.css

### 4.3 JavaScript Logic and Data Layer
The project uses localStorage as a browser-side data store and separates concerns into two scripts:

- auth.js:
  - Handles user registration/login and role-based redirects.
  - Stores users and current session in localStorage.

- app.js:
  - Implements attendance analytics, CT mark calculations, semester CGPA updates, notice publishing, advisor assignment, advisor ranking, and messaging workflows.
  - Uses storage keys for attendance, courses, semester setup, semester CGPA, notices, assignments, and messages.

## 5 Final Front End Design
The final front-end is a consistent, user-friendly academic portal with role-based navigation and clean card/table-based modules.

### 5.1 Student Interface
- Quick academic status visibility
- Attendance summary with risk badges
- CT score-based performance label updates
- Semester-wise CGPA tracking

### 5.2 Advisor Interface
- Student ranking view
- Message inbox and response flow
- Danger-zone messaging for at-risk students

### 5.3 Admin Interface
- Notice publication with priority tagging
- Advisor assignment by student serial range

## 6 Testing and Validation
Functional checks performed:
- Login/register for all three roles.
- Role-based redirection to correct dashboards.
- Form validation for required fields and password confirmation.
- Attendance percentage and risk-state updates.
- CT marks total and performance-state recalculation.
- Notice creation and assignment history update.
- Advisor-student message flow and status display.
- Data persistence across page refresh through localStorage.

## 7 Discussion
Academic Radar improves academic monitoring by integrating student records, performance indicators, communication channels, and administrative controls into one front-end workflow. The system reduces manual tracking effort and supports faster advisor intervention for at-risk students.

## 8 Conclusion
This front-end implementation demonstrates how a role-based academic management system can be developed using core web technologies. The architecture is modular, the interface is responsive, and the feature set aligns with practical departmental monitoring needs.

## 9 Future Improvements
- Integrate a backend database and secure API.
- Add authentication hardening and password hashing on server side.
- Introduce analytics dashboards and exportable reports.
- Add notification channels (email/SMS).
- Support multi-department scalability and audit logs.
