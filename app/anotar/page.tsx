import { redirect } from "next/navigation";

// The route used to be /anotar, in Portuguese, while the rest of the repository is in
// English. It is kept as a redirect because the app has been public since 2026-08-13 and
// the path may already be bookmarked, shared or indexed.
export default function AnotarRedirect() {
  redirect("/annotate");
}
