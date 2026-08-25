import { redirect } from "next/navigation";

// Kept for the same reason as /anotar: the old Portuguese path stays reachable.
export default function TextoRedirect() {
  redirect("/text");
}
