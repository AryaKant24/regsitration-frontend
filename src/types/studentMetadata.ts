/**
 * PROD0-56: Student Registration Metadata
 *
 * Type contract for the student information collected during registration.
 * These fields are sent alongside captured frames as part of the
 * multipart/form-data payload to the backend.
 */

// ---------------------------------------------------------------------------
// Student Metadata
// ---------------------------------------------------------------------------

export interface StudentMetadata {
  /**
   * Full name of the student.
   * Example: "Aarya Deshmukh"
   */
  name: string;

  /**
   * Permanent Registration Number — unique institutional ID.
   * Example: "72210814"
   */
  prn: string;

  /**
   * Academic department.
   * Example: "Information Technology"
   */
  department: string;

  /**
   * Class division.
   * Example: "A" | "B" | "C"
   */
  division: string;

  /**
   * Class roll number.
   * Example: "42"
   */
  rollNumber: string;
}
