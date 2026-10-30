import { useEffect, useMemo, useState } from 'react'
import { aptitudeQuestions } from './data/questions.js'
import { appendSheetRow, readSheet, mapStudent, mapResult } from './api.js'

const STUDENTS_KEY = 'placement_lms_students_v1'
const RESULTS_KEY = 'placement_lms_results_v1'
const SESSION_KEY = 'placement_lms_session_v1'
const ADMIN_EMAIL = 'admin@placementlms.local'
const ADMIN_PASSWORD = 'Admin@123'

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}
function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}
function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
function formatTime(totalSeconds) {
  const safe = Math.max(0, totalSeconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function mergeById(remote, local) {
  const merged = new Map()
  for (const item of remote) if (item.id) merged.set(item.id, item)
  for (const item of local) if (item.id) merged.set(item.id, { ...merged.get(item.id), ...item })
  return [...merged.values()]
}

export default function App() {
  const [session, setSession] = useState(() => readStorage(SESSION_KEY, null))
  const [page, setPage] = useState('home')
  const [notice, setNotice] = useState('')
  const [students, setStudents] = useState(() => readStorage(STUDENTS_KEY, []))
  const [results, setResults] = useState(() => readStorage(RESULTS_KEY, []))
  const [activeTest, setActiveTest] = useState(null)

  useEffect(() => {
    let active = true
    Promise.all([readSheet('students'), readSheet('results')])
      .then(([studentRows, resultRows]) => {
        if (!active) return
        const remoteStudents = studentRows.map(mapStudent)
        const remoteResults = resultRows.map(mapResult)
        setStudents((local) => mergeById(remoteStudents, local))
        setResults((local) => mergeById(remoteResults, local))
        setNotice('Google Sheets connected. Shared student records and test results loaded.')
      })
      .catch((error) => {
        if (active) setNotice(`Google Sheets connection issue: ${error.message}. Check the Apps Script deployment and setup guide.`)
      })
    return () => { active = false }
  }, [])

  useEffect(() => writeStorage(STUDENTS_KEY, students), [students])
  useEffect(() => writeStorage(RESULTS_KEY, results), [results])
  useEffect(() => {
    if (session) writeStorage(SESSION_KEY, session)
    else localStorage.removeItem(SESSION_KEY)
  }, [session])

  const currentStudent = useMemo(
    () => session?.role === 'student' ? students.find((student) => student.id === session.studentId) : null,
    [session, students],
  )

  function logout() {
    setSession(null)
    setActiveTest(null)
    setPage('home')
    setNotice('You have been logged out.')
  }

  function register(form) {
    const email = form.email.trim().toLowerCase()
    if (students.some((student) => student.email === email)) {
      setNotice('This email is already registered. Please log in.')
      return
    }
    const student = {
      id: makeId(),
      name: form.name.trim(),
      email,
      rollNumber: form.rollNumber.trim(),
      course: form.course.trim(),
      batch: form.batch.trim(),
      password: form.password,
      registeredAt: new Date().toISOString(),
    }
    setStudents((prev) => [...prev, student])
    appendSheetRow('students', {
      Student_ID: student.id, Name: student.name, Roll_Number: student.rollNumber,
      Email: student.email, Course: student.course, Batch: student.batch,
      Phone: '', Created_At: student.registeredAt,
    }).then(() => readSheet('students')).then((rows) => setStudents((prev) => mergeById(rows.map(mapStudent), prev)))
      .catch((error) => setNotice(`Registration is on this device, but Google Sheets sync failed: ${error.message}`))
    setSession({ role: 'student', studentId: student.id })
    setPage('student')
    setNotice('Registration submitted. Syncing student record to Google Sheets…')
  }

  function login(emailValue, password, role) {
    const email = emailValue.trim().toLowerCase()
    if (role === 'admin') {
      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        setSession({ role: 'admin' })
        setPage('admin')
        setNotice('')
      } else setNotice('Admin credentials are incorrect.')
      return
    }
    const student = students.find((item) => item.email === email && item.password === password)
    if (!student) {
      setNotice('Email or password is incorrect. If you are new, please register first.')
      return
    }
    setSession({ role: 'student', studentId: student.id })
    setPage('student')
    setNotice('')
  }

  function startTest() {
    const existing = results.find((result) => result.studentId === currentStudent?.id && result.testId === 'mca-aptitude-set-1')
    if (existing) {
      setNotice('A result is already recorded for this test in this browser profile.')
      return
    }
    setActiveTest({
      startedAt: Date.now(),
      endsAt: Date.now() + 60 * 60 * 1000,
      answers: {},
      currentQuestion: 0,
    })
    setPage('test')
    setNotice('')
  }

  function submitTest(answers, startedAt, autoSubmitted = false) {
    if (!currentStudent) return
    const score = aptitudeQuestions.reduce((total, question) => {
      const accepted = question.acceptedAnswers ?? (question.answer === null ? [] : [question.answer])
      return total + (accepted.includes(Number(answers[question.id])) ? 1 : 0)
    }, 0)
    const result = {
      id: makeId(),
      testId: 'mca-aptitude-set-1',
      testName: 'MCA Aptitude Test – Campus Placement Preparation (Set-1)',
      studentId: currentStudent.id,
      studentName: currentStudent.name,
      email: currentStudent.email,
      rollNumber: currentStudent.rollNumber,
      score,
      totalQuestions: aptitudeQuestions.length,
      percentage: Math.round((score / aptitudeQuestions.length) * 100),
      startedAt: new Date(startedAt).toISOString(),
      submittedAt: new Date().toISOString(),
      durationSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
      autoSubmitted,
      answers,
    }
    setResults((prev) => [...prev, result])
    appendSheetRow('results', {
      Result_ID: result.id, Student_ID: result.studentId, Student_Name: result.studentName,
      Test_Name: result.testName, Score: result.score, Total_Marks: result.totalQuestions,
      Percentage: result.percentage, Submitted_At: result.submittedAt,
    }).then(() => readSheet('results')).then((rows) => setResults((prev) => mergeById(rows.map(mapResult), prev)))
      .catch((error) => setNotice(`Test result is on this device, but Google Sheets sync failed: ${error.message}`))
    setActiveTest(null)
    setPage('result')
    setNotice(autoSubmitted ? 'Time is up. Your test was submitted. Syncing result to Google Sheets…' : 'Your test was submitted. Syncing result to Google Sheets…')
  }

  function exportResults() {
    const headings = ['Student Name', 'Email', 'Roll Number', 'Test', 'Score', 'Total', 'Percentage', 'Started At', 'Submitted At', 'Duration Seconds', 'Auto Submitted']
    const rows = results.map((r) => [
      r.studentName, r.email, r.rollNumber, r.testName, r.score, r.totalQuestions, r.percentage,
      r.startedAt, r.submittedAt, r.durationSeconds, r.autoSubmitted ? 'Yes' : 'No',
    ])
    const csv = [headings, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'placement-lms-results.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage(session?.role === 'admin' ? 'admin' : session?.role === 'student' ? 'student' : 'home')}>
          <span className="brand-mark">P</span>
          <span><strong>Placement LMS</strong><small>Aspire. Achieve. Ascend.</small></span>
        </button>
        <div className="top-actions">
          {session && <span className="role-pill">{session.role === 'admin' ? 'Administrator' : 'Student Portal'}</span>}
          {session && <button className="button button-quiet button-small" onClick={logout}>Log out</button>}
        </div>
      </header>

      <main className="main-content">
        {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}

        {!session && page === 'home' && <Home onNavigate={setPage} />}
        {!session && page === 'register' && <Register onRegister={register} onBack={() => { setPage('home'); setNotice('') }} />}
        {!session && page === 'login' && <Login onLogin={login} onBack={() => { setPage('home'); setNotice('') }} />}
        {!session && page === 'admin-login' && <AdminLogin onLogin={login} onBack={() => { setPage('home'); setNotice('') }} />}

        {session?.role === 'student' && page !== 'test' && (
          <StudentDashboard
            student={currentStudent}
            results={results.filter((result) => result.studentId === currentStudent?.id)}
            onStartTest={startTest}
            onNavigate={setPage}
          />
        )}
        {session?.role === 'student' && page === 'test' && activeTest && currentStudent && (
          <TestRunner
            key={activeTest.startedAt}
            activeTest={activeTest}
            onSubmit={submitTest}
          />
        )}
        {session?.role === 'student' && page === 'test' && !activeTest && (
          <StudentDashboard student={currentStudent} results={results.filter((result) => result.studentId === currentStudent?.id)} onStartTest={startTest} onNavigate={setPage} />
        )}
        {session?.role === 'admin' && <AdminDashboard students={students} results={results} onExport={exportResults} />}
      </main>

      <footer className="footer">Placement LMS <span>•</span> Student assessment portal</footer>
    </div>
  )
}

function Home({ onNavigate }) {
  return (
    <section className="hero-layout">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" /> CAREER READINESS PLATFORM</div>
        <h1>Prepare today.<br /><span>Place tomorrow.</span></h1>
        <p className="hero-description">A central place for students to take placement assessments and for administrators to review registrations and results.</p>
        <div className="hero-buttons">
          <button className="button button-primary" onClick={() => onNavigate('register')}>Create student account <span>→</span></button>
          <button className="button button-secondary" onClick={() => onNavigate('login')}>Student login</button>
        </div>
        <button className="text-link" onClick={() => onNavigate('admin-login')}>Administrator login →</button>
        <div className="feature-strip">
          <div><strong>01</strong><span>Register</span></div>
          <div><strong>02</strong><span>Take assessment</span></div>
          <div><strong>03</strong><span>View results</span></div>
        </div>
      </div>
      <div className="hero-visual">
        <div className="visual-orbit orbit-one" />
        <div className="visual-orbit orbit-two" />
        <div className="visual-card main-visual-card">
          <div className="visual-card-top"><span className="mini-icon">✓</span><span className="visual-label">ASSESSMENT READY</span><span className="status-dot" /></div>
          <div className="visual-title">MCA Aptitude<br />Test – Set-1</div>
          <div className="visual-subtitle">Build confidence through practice.</div>
          <div className="progress-label"><span>Test readiness</span><strong>Start here</strong></div>
          <div className="progress-track"><span /></div>
          <div className="visual-meta"><span>◷ 60 minutes</span><span>▤ Timed test</span></div>
        </div>
        <div className="floating-note note-top"><span className="note-icon">↗</span><span><strong>Track progress</strong><small>Review your results</small></span></div>
        <div className="floating-note note-bottom"><span className="note-icon note-green">✓</span><span><strong>Auto-submit</strong><small>When time runs out</small></span></div>
        <div className="visual-decoration deco-a" /><div className="visual-decoration deco-b" />
      </div>
    </section>
  )
}

function Register({ onRegister, onBack }) {
  const [form, setForm] = useState({ name: '', email: '', rollNumber: '', course: 'BCA', batch: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const update = (event) => setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  function submit(event) {
    event.preventDefault()
    if (form.password.length < 8) return setError('Password must be at least 8 characters.')
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.')
    if (!form.name.trim() || !form.email.trim() || !form.rollNumber.trim() || !form.batch.trim()) return setError('Please fill in all required fields.')
    setError('')
    onRegister(form)
  }
  return (
    <section className="form-layout">
      <div className="form-aside"><div className="aside-symbol">✦</div><div className="eyebrow">STUDENT ONBOARDING</div><h2>Your next opportunity starts here.</h2><p>Create your profile to access placement assessments and track your performance.</p><div className="aside-foot">Aspire. Achieve. Ascend.</div></div>
      <div className="form-panel">
        <button className="back-link" onClick={onBack}>← Back to home</button>
        <h2>Create account</h2><p className="muted">Enter your details to register as a student.</p>
        {error && <div className="inline-error">{error}</div>}
        <form onSubmit={submit} className="form-grid">
          <Field label="Full name" name="name" value={form.name} onChange={update} placeholder="Enter full name" required />
          <Field label="Email address" name="email" type="email" value={form.email} onChange={update} placeholder="you@example.com" required />
          <Field label="Roll number" name="rollNumber" value={form.rollNumber} onChange={update} placeholder="Enter roll number" required />
          <label className="field"><span>Course</span><select name="course" value={form.course} onChange={update}><option>BCA</option><option>MCA</option><option>BBA</option><option>MBA</option><option>Other</option></select></label>
          <Field label="Batch / Passing year" name="batch" value={form.batch} onChange={update} placeholder="e.g. 2024–2027" required />
          <div />
          <Field label="Password" name="password" type="password" value={form.password} onChange={update} placeholder="At least 8 characters" required />
          <Field label="Confirm password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={update} placeholder="Re-enter password" required />
          <button className="button button-primary form-submit" type="submit">Register account <span>→</span></button>
        </form>
      </div>
    </section>
  )
}

function Field({ label, name, value, onChange, placeholder, type = 'text', required = false }) {
  return <label className="field"><span>{label}</span><input name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} required={required} autoComplete={type === 'password' ? 'new-password' : 'on'} /></label>
}

function Login({ onLogin, onBack }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  function submit(event) { event.preventDefault(); onLogin(email, password, 'student') }
  return <LoginShell title="Welcome back" subtitle="Log in to your student account." onBack={onBack} onSubmit={submit} email={email} setEmail={setEmail} password={password} setPassword={setPassword} buttonText="Log in to student portal" />
}
function AdminLogin({ onLogin, onBack }) {
  const [email, setEmail] = useState(ADMIN_EMAIL)
  const [password, setPassword] = useState(ADMIN_PASSWORD)
  function submit(event) { event.preventDefault(); onLogin(email, password, 'admin') }
  return <LoginShell title="Administrator login" subtitle="Access student registrations and assessment results." onBack={onBack} onSubmit={submit} email={email} setEmail={setEmail} password={password} setPassword={setPassword} buttonText="Open admin dashboard" admin />
}
function LoginShell({ title, subtitle, onBack, onSubmit, email, setEmail, password, setPassword, buttonText, admin = false }) {
  return <section className="login-wrap"><div className="login-card"><button className="back-link" onClick={onBack}>← Back to home</button><div className="login-symbol">{admin ? '⌘' : '↗'}</div><h2>{title}</h2><p className="muted">{subtitle}</p><form onSubmit={onSubmit} className="login-form"><label className="field"><span>Email address</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button className="button button-primary form-submit">{buttonText} <span>→</span></button></form>{admin && <div className="demo-credentials"><strong>Demo credentials</strong><span>Email: {ADMIN_EMAIL}</span><span>Password: {ADMIN_PASSWORD}</span><small>Change these before using with real students. This starter uses browser storage, not secure production authentication.</small></div>}</div></section>
}

function StudentDashboard({ student, results, onStartTest }) {
  if (!student) return <div className="empty-state"><h2>Student profile not found</h2><p>Please log out and register or log in again.</p></div>
  const hasAttempted = results.some((result) => result.testId === 'mca-aptitude-set-1')
  const latestResult = results.find((result) => result.testId === 'mca-aptitude-set-1')
  return <section className="dashboard">
    <div className="dashboard-heading"><div><div className="eyebrow">STUDENT PORTAL</div><h1>Welcome, {student.name.split(' ')[0]}.</h1><p className="muted">Here is your placement assessment workspace.</p></div><div className="avatar">{student.name.slice(0, 1).toUpperCase()}</div></div>
    <div className="student-profile-card"><div><span className="detail-label">STUDENT PROFILE</span><h3>{student.name}</h3><p>{student.email}</p></div><div className="profile-details"><div><span>Roll number</span><strong>{student.rollNumber}</strong></div><div><span>Course</span><strong>{student.course}</strong></div><div><span>Batch</span><strong>{student.batch}</strong></div></div></div>
    <div className="section-heading"><div><h2>Available assessments</h2><p className="muted">Complete the active assessment to check your readiness.</p></div><span className="count-label">3 ASSESSMENTS</span></div>
    <div className="assessment-grid">
      <article className="assessment-card assessment-active"><div className="assessment-top"><div className="assessment-icon">∑</div><span className="status-chip active-chip">{hasAttempted ? 'Completed' : 'Available'}</span></div><div className="eyebrow">ASSESSMENT 01</div><h3>MCA Aptitude Test – Set-1</h3><p>Campus Placement Preparation assessment.</p><div className="assessment-meta"><span>◷ 60 minutes</span><span>▤ {aptitudeQuestions.length} questions</span></div>{hasAttempted ? <div className="attempt-result"><strong>Score: {latestResult.score}/{latestResult.totalQuestions}</strong><span>{latestResult.percentage}% · Attempt recorded</span></div> : <button className="button button-primary full-button" onClick={onStartTest}>Start assessment <span>→</span></button>}</article>
      <ComingSoon number="02" title="Technical MCQ Test" description="A multiple-choice assessment covering technical concepts." />
      <ComingSoon number="03" title="Programming Assessment" description="Solve coding problems and demonstrate programming skills." />
    </div>
    {results.length > 0 && <section className="history-card"><div className="section-heading"><div><h2>My results</h2><p className="muted">Your submitted assessment history.</p></div></div><ResultsTable results={results} /></section>}
  </section>
}
function ComingSoon({ number, title, description }) {
  return <article className="assessment-card assessment-disabled"><div className="assessment-top"><div className="assessment-icon muted-icon">{number === '02' ? '⌘' : '{ }'}</div><span className="status-chip soon-chip">Coming soon</span></div><div className="eyebrow">ASSESSMENT {number}</div><h3>{title}</h3><p>{description}</p><div className="assessment-meta"><span>◷ Timed</span><span>▤ Online test</span></div><button className="button button-disabled full-button" disabled>Not available yet</button></article>
}

function TestRunner({ activeTest, onSubmit }) {
  const [answers, setAnswers] = useState({})
  const [current, setCurrent] = useState(0)
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((activeTest.endsAt - Date.now()) / 1000)))
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const question = aptitudeQuestions[current]
  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((activeTest.endsAt - Date.now()) / 1000))), 250)
    return () => window.clearInterval(timer)
  }, [activeTest.endsAt])
  useEffect(() => {
    if (remaining <= 0 && !submitted) {
      setSubmitted(true)
      onSubmit(answers, activeTest.startedAt, true)
    }
  }, [remaining, submitted, answers, activeTest.startedAt, onSubmit])
  useEffect(() => {
    function warn(event) { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  const answeredCount = Object.keys(answers).length
  function finish(auto = false) {
    if (submitted) return
    setSubmitted(true)
    onSubmit(answers, activeTest.startedAt, auto)
  }
  return <section className="test-page">
    <div className="test-header"><div><div className="eyebrow">PLACEMENT ASSESSMENT</div><h1>MCA Aptitude Test – Set-1</h1><p className="muted">Campus Placement Preparation. Choose one answer for each question. Your progress is saved for submission in this session.</p></div><div className={`timer-card ${remaining < 300 ? 'timer-warning' : ''}`}><span>TIME REMAINING</span><strong>◷ {formatTime(remaining)}</strong><small>Auto-submit at zero</small></div></div>
    <div className="test-layout"><aside className="question-sidebar"><div className="sidebar-title"><strong>Questions</strong><span>{answeredCount}/{aptitudeQuestions.length} answered</span></div><div className="question-numbers">{aptitudeQuestions.map((q, index) => <button key={q.id} className={`question-number ${current === index ? 'selected' : ''} ${answers[q.id] !== undefined ? 'answered' : ''}`} onClick={() => setCurrent(index)}>{index + 1}</button>)}</div><div className="legend"><span><i className="legend-answered" /> Answered</span><span><i className="legend-current" /> Current</span><span><i className="legend-empty" /> Not answered</span></div></aside>
      <div className="question-panel"><div className="question-panel-top"><span>QUESTION {current + 1} OF {aptitudeQuestions.length}</span><span className="question-tag">Single choice</span></div><div className="question-progress"><span style={{ width: `${((current + 1) / aptitudeQuestions.length) * 100}%` }} /></div><h2>{question.question}</h2><div className="options-list">{question.options.map((option, index) => <button key={option} className={`option-button ${answers[question.id] === index ? 'option-selected' : ''}`} onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: index }))}><span className="option-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span><span className="option-radio">{answers[question.id] === index ? '●' : '○'}</span></button>)}</div><div className="question-actions"><button className="button button-secondary" disabled={current === 0} onClick={() => setCurrent((n) => n - 1)}>← Previous</button><div className="question-actions-right">{current < aptitudeQuestions.length - 1 ? <button className="button button-primary" onClick={() => setCurrent((n) => n + 1)}>Next question →</button> : <button className="button button-primary" onClick={() => setConfirmSubmit(true)}>Submit test ✓</button>}</div></div></div></div>
    {confirmSubmit && <div className="modal-backdrop"><div className="confirm-modal"><div className="login-symbol">?</div><h2>Submit your assessment?</h2><p className="muted">You have answered {answeredCount} of {aptitudeQuestions.length} questions. Unanswered questions will be marked incorrect.</p><div className="modal-actions"><button className="button button-secondary" onClick={() => setConfirmSubmit(false)}>Continue test</button><button className="button button-primary" onClick={() => finish(false)}>Submit now</button></div></div></div>}
  </section>
}

function AdminDashboard({ students, results, onExport }) {
  const [tab, setTab] = useState('students')
  const [search, setSearch] = useState('')
  const filteredStudents = students.filter((student) => `${student.name} ${student.email} ${student.rollNumber} ${student.course}`.toLowerCase().includes(search.toLowerCase()))
  const filteredResults = results.filter((result) => `${result.studentName} ${result.email} ${result.rollNumber}`.toLowerCase().includes(search.toLowerCase()))
  return <section className="dashboard">
    <div className="dashboard-heading"><div><div className="eyebrow">ADMINISTRATION</div><h1>Admin dashboard</h1><p className="muted">Manage student registrations and assessment performance.</p></div><div className="avatar admin-avatar">⌘</div></div>
    <div className="stats-grid"><Stat label="Registered students" value={students.length} detail="Student profiles" icon="♙" /><Stat label="Test attempts" value={results.length} detail="Submitted assessments" icon="✓" /><Stat label="Average score" value={results.length ? `${Math.round(results.reduce((sum, r) => sum + r.percentage, 0) / results.length)}%` : '—'} detail="Across all attempts" icon="↗" /><Stat label="Assessments active" value="1 / 3" detail="Two coming soon" icon="▤" /></div>
    <section className="admin-table-card"><div className="table-toolbar"><div className="tab-buttons"><button className={tab === 'students' ? 'tab-active' : ''} onClick={() => { setTab('students'); setSearch('') }}>Student registrations <span>{students.length}</span></button><button className={tab === 'results' ? 'tab-active' : ''} onClick={() => { setTab('results'); setSearch('') }}>Assessment results <span>{results.length}</span></button></div><div className="table-actions"><input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, roll no." />{tab === 'results' && <button className="button button-secondary button-small" onClick={onExport}>Export CSV ↓</button>}</div></div>
      {tab === 'students' ? <div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>ROLL NUMBER</th><th>COURSE</th><th>BATCH</th><th>REGISTERED</th></tr></thead><tbody>{filteredStudents.map((student) => <tr key={student.id}><td><div className="table-person"><span className="table-avatar">{student.name.slice(0, 1).toUpperCase()}</span><span><strong>{student.name}</strong><small>{student.email}</small></span></div></td><td>{student.rollNumber}</td><td>{student.course}</td><td>{student.batch}</td><td>{new Date(student.registeredAt).toLocaleDateString()}</td></tr>)}</tbody></table>{filteredStudents.length === 0 && <EmptyTable text="No student registrations found." />}</div> : <div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>ASSESSMENT</th><th>SCORE</th><th>DURATION</th><th>SUBMITTED</th><th>STATUS</th></tr></thead><tbody>{filteredResults.map((result) => <tr key={result.id}><td><div className="table-person"><span className="table-avatar">{result.studentName.slice(0, 1).toUpperCase()}</span><span><strong>{result.studentName}</strong><small>{result.email}</small></span></div></td><td>{result.testName}</td><td><strong>{result.score}/{result.totalQuestions}</strong><small className="table-subline">{result.percentage}%</small></td><td>{formatTime(result.durationSeconds)}</td><td>{new Date(result.submittedAt).toLocaleString()}</td><td><span className={`status-chip ${result.autoSubmitted ? 'soon-chip' : 'active-chip'}`}>{result.autoSubmitted ? 'Auto-submitted' : 'Submitted'}</span></td></tr>)}</tbody></table>{filteredResults.length === 0 && <EmptyTable text="No assessment results found." />}</div>}
    </section>
    <div className="warning-note"><strong>Starter version notice</strong><p>Records currently live in this browser's local storage, so they are not shared across devices and can be cleared by the browser. Before real student use, configure Firebase Authentication/Firestore with security rules and connect a protected Google Sheets endpoint.</p></div>
  </section>
}
function Stat({ label, value, detail, icon }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><i>{icon}</i></div><strong className="stat-value">{value}</strong><small>{detail}</small></article>
}
function ResultsTable({ results }) {
  return <div className="table-wrap"><table><thead><tr><th>ASSESSMENT</th><th>SCORE</th><th>DURATION</th><th>SUBMITTED</th></tr></thead><tbody>{results.map((r) => <tr key={r.id}><td>{r.testName}</td><td><strong>{r.score}/{r.totalQuestions}</strong> ({r.percentage}%)</td><td>{formatTime(r.durationSeconds)}</td><td>{new Date(r.submittedAt).toLocaleString()}</td></tr>)}</tbody></table></div>
}
function EmptyTable({ text }) {
  return <div className="empty-table"><span>⌕</span><strong>{text}</strong><small>New records will appear here.</small></div>
}
