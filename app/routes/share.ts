import { redirect } from "react-router";

// Shares are taken by the service worker before they reach the network. One that arrives here
// came without it, so its content is dropped unread.
export function action() {
  return redirect("/", 303);
}
