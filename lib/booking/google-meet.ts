// Google Meet link creation for bookings.
//
// A real Meet link means creating a Google Calendar event with conferenceData,
// which requires an OAuth2 refresh token (or a service account with domain-wide
// delegation) — neither is wired yet. So this returns null and the booking flow
// falls back to "Detail hovoru Vám pošleme deň pred termínom.". Once an OAuth
// refresh token is added, implement the event creation here.

export function googleMeetConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() && process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim(),
  );
}

export async function createMeetLink(): Promise<string | null> {
  // Not implemented yet (needs an OAuth refresh token). No Meet link for now.
  return null;
}
