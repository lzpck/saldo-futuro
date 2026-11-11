import { verifySession } from "@/lib/auth/dal";
import { AppMain } from "@/components/app-main";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children, modal }: LayoutProps<"/">) {
  await verifySession();
  return (
    <>
      <Nav />
      <AppMain>{children}</AppMain>
      {modal}
    </>
  );
}
