export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start GitHub OAuth from an event handler. The server generates the CSRF state
// and PKCE verifier, keeps both in httpOnly cookies, and redirects to GitHub.
export const startLogin = () => {
  window.location.assign("/api/oauth/github/start");
};
