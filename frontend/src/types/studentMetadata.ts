/**
 * Student Registration Metadata
 *
 * Type contract for the student information collected during registration.
 * These fields are sent alongside captured frames as part of the
 * multipart/form-data payload to the backend.
 */

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
}
