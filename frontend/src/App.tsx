import { useState } from 'react';
import { StudentRegistrationForm } from './components/StudentRegistrationForm';
import { RecorderController } from './components/RecorderController';
import type { StudentMetadata } from './types/studentMetadata';
import './App.css';

/**
 * App
 *
 * Two-step registration flow:
 *   Step 1 — Student info form  (name, PRN, department, division, roll number)
 *   Step 2 — Face capture       (kiosk UI with frame extraction + payload builder)
 */
function App() {
  const [student, setStudent] = useState<StudentMetadata | null>(null);

  const handleFormSubmit = (metadata: StudentMetadata) => {
    setStudent(metadata);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRetake = () => {
    setStudent(null);
  };

  return (
    <div className="app">
      {/* === Navbar === */}
      <nav className="navbar" id="navbar">
        <div className="navbar__inner">
          <a href="/" className="navbar__brand">
            <div className="navbar__logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="6" fill="var(--color-primary)" />
                <path d="M7 12.5l3.5 3.5 6.5-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="navbar__title">Student Registration</span>
          </a>
          <div className="navbar__links">
            <span className={`navbar__link ${!student ? 'navbar__link--active' : ''}`}>
              1. Student Info
            </span>
            <span className="navbar__step-sep">›</span>
            <span className={`navbar__link ${student ? 'navbar__link--active' : ''}`}>
              2. Face Capture
            </span>
          </div>
        </div>
      </nav>

      {/* === Page Header === */}
      <header className="page-header">
        <div className="page-header__inner">
          <h1 className="page-header__title">
            {student ? 'Face Registration' : 'Student Information'}
          </h1>
          <p className="page-header__desc">
            {student
              ? `Registering: ${student.name} · PRN ${student.prn}`
              : 'Enter your details below before we capture your face for identity verification.'}
          </p>
        </div>
      </header>

      {/* === Main Content === */}
      <main className="main">
        {!student ? (
          <StudentRegistrationForm onSubmit={handleFormSubmit} />
        ) : (
          <RecorderController studentMetadata={student} onRetake={handleRetake} />
        )}
      </main>

      {/* === Footer === */}
      <footer className="footer">
        <div className="footer__inner">
          <p className="footer__text">
            Ensure proper lighting and face the camera directly for best results.
          </p>
          <p className="footer__copyright">
            © {new Date().getFullYear()} Student Registration Portal
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
