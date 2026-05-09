import { useState, FormEvent } from 'react';
import type { StudentMetadata } from '../types/studentMetadata';
import './StudentRegistrationForm.css';

interface Props {
  onSubmit: (metadata: StudentMetadata) => void;
}

/**
 * StudentRegistrationForm
 *
 * Step 1 of the registration flow. Collects:
 *   - Full name
 *   - PRN (Permanent Registration Number)
 *
 * On submit, calls onSubmit(metadata) to advance to Step 2 (face capture).
 */
export function StudentRegistrationForm({ onSubmit }: Props) {
  const [name, setName] = useState('');
  const [prn, setPrn] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof StudentMetadata, string>>>({});

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof StudentMetadata, string>> = {};

    if (!name.trim()) newErrors.name = 'Full name is required.';
    else if (name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters.';

    if (!prn.trim()) newErrors.prn = 'PRN is required.';
    else if (prn.trim().length < 2) newErrors.prn = 'PRN must be at least 2 characters.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    onSubmit({
      name: name.trim(),
      prn: prn.trim(),
    });
  };

  return (
    <section className="reg-form-section" id="student-info">
      <div className="reg-form__container">
        <div className="reg-form__card">
          {/* Card header */}
          <div className="reg-form__header">
            <div className="reg-form__header-icon">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="10" fill="var(--color-primary-light)" />
                <path
                  d="M20 10a5 5 0 100 10 5 5 0 000-10zM10 30c0-5.523 4.477-10 10-10s10 4.477 10 10"
                  stroke="var(--color-primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h2 className="reg-form__title">Student Details</h2>
              <p className="reg-form__subtitle">Both fields are required to proceed to face capture.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate className="reg-form__form">
            {/* Row: Name + PRN */}
            <div className="reg-form__row">
              <div className="reg-form__field">
                <label className="reg-form__label" htmlFor="field-name">
                  Full Name
                </label>
                <input
                  id="field-name"
                  type="text"
                  className={`reg-form__input ${errors.name ? 'reg-form__input--error' : ''}`}
                  placeholder="e.g. Aarya Deshmukh"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  autoFocus
                />
                {errors.name && <p className="reg-form__error">{errors.name}</p>}
              </div>

              <div className="reg-form__field">
                <label className="reg-form__label" htmlFor="field-prn">
                  PRN Number
                </label>
                <input
                  id="field-prn"
                  type="text"
                  className={`reg-form__input ${errors.prn ? 'reg-form__input--error' : ''}`}
                  placeholder="e.g. ABC2024001"
                  value={prn}
                  onChange={(e) => setPrn(e.target.value)}
                  maxLength={20}
                />
                {errors.prn && <p className="reg-form__error">{errors.prn}</p>}
              </div>
            </div>

            {/* Submit */}
            <div className="reg-form__footer">
              <button type="submit" className="reg-form__submit" id="btn-proceed-to-capture">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M4 5a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M12 6.5l3-1.5v8l-3-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Proceed to Face Capture
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
