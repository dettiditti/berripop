import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Attaches the Clerk session to every request. Each server action still checks
// sign-in (and circle membership) itself, so data never relies on the matcher.
// Account pages that only make sense signed in are protected here as well:
// signed-out visitors are sent to the sign-in page.
// Public pages, the legal ones included, stay open to everyone.
export const SIGNED_IN_ONLY = ["/settings(.*)"];
const isSignedInOnly = createRouteMatcher(SIGNED_IN_ONLY);

export default clerkMiddleware(async (auth, req) => {
  if (!isSignedInOnly(req)) return;
  const { userId } = await auth();
  if (userId) return;
  const signIn = new URL("/sign-in", req.url);
  signIn.searchParams.set("redirect_url", req.nextUrl.pathname);
  return NextResponse.redirect(signIn);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
