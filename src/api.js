// Google Apps Script bridge for Placement LMS.
// Reads use JSONP (Apps Script ContentService redirects are not CORS-friendly).
// Writes use a simple text/plain POST to avoid browser preflight requests.
export const GOOGLE_SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbxwUJzBu6_0F-zZ9d1YCbLSD-IavUSYxxR7-mHdQRXkSzgPWsLo3DdVCwJhNoy8WGg2IQ/exec'

export function readSheet(sheet) {
  return new Promise((resolve, reject) => {
    const callback = `placementLmsCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')
    const timer = window.setTimeout(() => finish(new Error('Google Sheets request timed out')), 15000)
    function finish(error, data) {
      window.clearTimeout(timer)
      delete window[callback]
      script.remove()
      if (error) reject(error)
      else if (!data?.ok) reject(new Error(data?.error || 'Google Sheets read failed'))
      else resolve(data.rows || [])
    }
    window[callback] = (data) => finish(null, data)
    script.onerror = () => finish(new Error('Could not reach Google Apps Script. Check deployment access and URL.'))
    const params = new URLSearchParams({ action: 'list', sheet, callback })
    script.src = `${GOOGLE_SHEETS_API_URL}?${params.toString()}`
    document.head.appendChild(script)
  })
}

export async function appendSheetRow(sheet, row) {
  // Apps Script Web Apps commonly do not expose CORS response headers.
  // no-cors makes the write request possible; the subsequent JSONP refresh verifies visibility.
  await fetch(GOOGLE_SHEETS_API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ sheet, row }),
  })
}

export function mapStudent(row) {
  return {
    id: String(row.Student_ID || ''), name: String(row.Name || ''),
    rollNumber: String(row.Roll_Number || ''), email: String(row.Email || '').toLowerCase(),
    course: String(row.Course || ''), batch: String(row.Batch || ''),
    registeredAt: String(row.Created_At || ''),
  }
}
export function mapResult(row) {
  return {
    id: String(row.Result_ID || ''), testId: 'mca-aptitude-set-1',
    testName: String(row.Test_Name || ''), studentId: String(row.Student_ID || ''),
    studentName: String(row.Student_Name || ''), email: String(row.Email || '').toLowerCase(),
    rollNumber: String(row.Roll_Number || ''), score: Number(row.Score || 0),
    totalQuestions: Number(row.Total_Marks || 0), percentage: Number(row.Percentage || 0),
    submittedAt: String(row.Submitted_At || ''),
    startedAt: '', durationSeconds: 0, autoSubmitted: false,
  }
}
