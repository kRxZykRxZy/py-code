# GitHub OAuth implementation reference

GitFolio uses GitHub's OAuth web application authorization-code flow. The `/api/oauth/github/start` route creates a CSRF `state` value and PKCE verifier, then redirects to GitHub. The callback exchanges the one-time authorization code at GitHub's token endpoint and uses the returned token to retrieve the authenticated user.

The application requests `read:user user:email`. Production deployments must register the exact callback URL:

```
https://<published-domain>/api/oauth/github/callback
```

GitHub's OAuth application API validates issued user tokens; it is not a standalone Client ID/Client Secret validation endpoint. Therefore credential validity is confirmed as part of the documented authorization-code exchange.

## Official references

- [Authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [Authenticating to the REST API with an OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authenticating-to-the-rest-api-with-an-oauth-app)
- [REST API endpoints for OAuth authorizations](https://docs.github.com/en/rest/apps/oauth-applications)
- [Creating an OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
