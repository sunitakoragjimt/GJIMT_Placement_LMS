# Google Sheets connection – Placement LMS

The React app is configured to use the Google Apps Script Web App URL supplied by the administrator. It syncs student registrations to the `Students` tab, assessment results to `Test Results`, and loads those shared records for the Admin dashboard.

## 1. Update the Apps Script code
1. Open the Google Sheet that should hold Placement LMS data.
2. Choose **Extensions → Apps Script**.
3. Replace the editor code with `GOOGLE_SHEETS_BACKEND_Code.gs` from this project.
4. Save the project.
5. Select `setupDatabase` in the function list and click **Run** once. Approve the requested spreadsheet permissions. This creates/updates the required tabs and headers.

## 2. Redeploy the existing Web App
1. In Apps Script choose **Deploy → Manage deployments**.
2. Edit the existing Web App deployment (pencil icon).
3. Select **New version** and deploy.
4. Keep the same deployment URL if possible. The frontend currently uses the URL provided for this LMS.
5. Confirm the deployment's access setting is appropriate for your institution before sharing the LMS.

## 3. Run the LMS
From the extracted `placement-lms-starter` folder:

```cmd
npm install
npm run dev
```

Open the local Vite URL printed in CMD, normally `http://localhost:5173`.

## 4. Test the connection safely
1. Open the LMS and register one test student using dummy details.
2. Open the linked Google Sheet and check the `Students` tab.
3. Submit a test attempt and check `Test Results`.
4. Open the Admin dashboard and confirm the shared student and result counts appear.

## Important limitations and security
- This version syncs student profile fields (name, roll number, email, course, batch) and aptitude test results. It does **not** send student passwords to Google Sheets.
- Student login is still the existing demo/local-browser login. A student account created on one browser will not authenticate on a different computer. Cross-device student authentication needs a proper server-side identity system (for example Firebase Authentication or Google Identity) and authorization rules.
- The included demo Admin login is hard-coded in the frontend. Do not use the demo credentials for real institutional administration.
- The starter Apps Script `list` endpoint returns sheet rows to whoever can access the Web App. If deployed as **Anyone**, student names, roll numbers and emails may be publicly readable by people who obtain the URL. Do not put sensitive/confidential data in this prototype or make it public for live institutional use. Before real deployment, implement authenticated admin-only reads and student-scoped access.
- The browser uses an Apps Script JSONP read and a simple POST. The POST response is opaque due to Apps Script cross-origin redirects; the app refreshes the sheet to check that records become visible. Always verify the test row in Google Sheets before using it with a class.
- The URL is included in `src/api.js`. If the deployment URL changes, update `GOOGLE_SHEETS_API_URL` there and rebuild/restart Vite.
