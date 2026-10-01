import { verifySession } from "@/lib/auth/dal";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await verifySession();
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 md:ml-60 md:max-w-none md:px-10 md:pb-10 md:pt-10">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </>
  );
}
