/*
 * Inside the phone app the Google button is hidden: Google refuses sign-in
 * from embedded web views, and App Store rules would ask for Sign in with
 * Apple next to it. Members who joined with Google can still sign in with a
 * code sent to the same email. Presentation only: Google stays enabled.
 */
export const inAppAuthAppearance = {
  elements: { socialButtonsRoot: { display: "none" }, dividerRow: { display: "none" } },
};
