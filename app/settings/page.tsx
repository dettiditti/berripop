import SettingsPage from "@/components/SettingsPage";

/** Signed-in only (enforced in middleware.ts). */
export default function Page() {
  return <SettingsPage />;
}
