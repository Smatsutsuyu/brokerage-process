import { clerkMiddleware } from "@clerk/nextjs/server";

// No auth.protect() calls yet — middleware is a passthrough until real Clerk
// keys land. When they do, add route protection here (e.g. createRouteMatcher
// for public routes, then auth().protect() for everything else).
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
