// Every outbound destination lives here. Set the two VITE_ values in Vercel
// (Settings -> Environment Variables) once the real links exist; until then
// the buttons are placeholders that go nowhere.
export const links = {
  bookingUrl: import.meta.env.VITE_BOOKING_URL || "#",
  stanCourseUrl: import.meta.env.VITE_STAN_COURSE_URL || "#",
  form656BookletUrl: "https://www.irs.gov/pub/irs-pdf/f656b.pdf",
};
