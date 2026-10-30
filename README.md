# Placement LMS – MCA Aptitude Set-1

React + Vite placement assessment portal. This package preserves the existing UI and includes the latest 50-question MCA Aptitude Test Set-1 question bank (60-minute timer), student registration/login demo, student dashboard, administrator dashboard and CSV result export.

## Run on Windows
1. Install Node.js LTS (https://nodejs.org/).
2. Extract this ZIP.
3. Open the `placement-lms-starter` folder.
4. Double-click `START_LMS.bat` (or open Command Prompt in this folder and run `npm install` followed by `npm run dev`).
5. Open the local URL printed by Vite, usually `http://localhost:5173`.

## Demo admin (local demo only)
- Email: `admin@placementlms.local`
- Password: `Admin@123`

## Google Sheets integration
The frontend is configured with the supplied Apps Script Web App URL. Student profile submissions and MCA aptitude test results are sent to Google Sheets; the Admin dashboard loads shared student and result rows from the sheet. Follow `GOOGLE_SHEETS_SETUP.md` to update and redeploy the Apps Script backend before testing.

**Important:** this is a prototype data-sync integration, not production authentication. Student passwords are not sent to Sheets, and student login remains browser-local. The demo admin login is hard-coded. The Apps Script list endpoint may expose student records to anyone who can access the deployment. Review the security notes in `GOOGLE_SHEETS_SETUP.md` before using real student data.
