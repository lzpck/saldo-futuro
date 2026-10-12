import { verifySession } from "@/lib/auth/dal";
import { Suspense } from "react";
import { AppMain } from "@/components/app-main";
import { BudgetNoticeBar } from "@/components/budget-notice";
import { Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children, modal }: LayoutProps<"/">) {
  await verifySession();
  return (
    <>
      <Nav />
      <AppMain
        notice={
          <Suspense>
            <BudgetNoticeBar />
          </Suspense>
        }
      >
        {children}
      </AppMain>
      {modal}
    </>
  );
}
