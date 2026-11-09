/*
 * Inside the phone app Clerk's own Apple and Google buttons stay in the card,
 * but only once the app's native sign-in is there to run them
 * (components/auth/NativeSignIn.tsx catches the tap): Google refuses sign-in
 * from embedded web views. Until then they and the divider are hidden (see
 * .in-app-social in globals.css); members can always use an email code.
 */
export const inAppAuthAppearance = {
  elements: { socialButtonsRoot: "in-app-social", dividerRow: "in-app-divider" },
};
