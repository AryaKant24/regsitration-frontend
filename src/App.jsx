import { RecorderController } from './components/RecorderController';
import './App.css';

/**
 * App
 *
 * Root component for the Student Registration portal.
 * Standard professional website layout with navbar, main content, and footer.
 *
 * Current scope: Video capture page only.
 *
 * Future extension:
 *   - Student information form page
 *   - Photo capture page
 *   - Video analysis results
 *   - Registration confirmation / dashboard
 *   Consider adding React Router for multi-page navigation.
 */
function App() {
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
            <a href="#video-capture" className="navbar__link navbar__link--active">Face Registration</a>
            {/* TODO: Add more nav links as registration steps are built */}
          </div>
        </div>
      </nav>

      {/* === Page Header === */}
      <header className="page-header">
        <div className="page-header__inner">
          <h1 className="page-header__title">Face Registration</h1>
          <p className="page-header__desc">
            Capture your face from multiple angles to complete your identity verification.
          </p>
        </div>
      </header>

      {/* === Main Content === */}
      <main className="main">
        <RecorderController />
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
