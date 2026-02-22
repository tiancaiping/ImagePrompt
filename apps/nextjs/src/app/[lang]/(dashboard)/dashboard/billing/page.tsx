import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@saasfly/ui/card";

import { DashboardShell } from "~/components/shell";
import type { Locale } from "~/config/i18n-config";
import { getDictionary } from "~/lib/get-dictionary";
import { trpc } from "~/trpc/server";
import { SubscriptionForm } from "./subscription-form";

export const metadata = {
  title: "Billing",
  description: "Manage billing and your subscription plan.",
};

export const dynamic = "force-dynamic";

interface Subscription {
  plan: string | null;
  endsAt: Date | null;
}

export default async function BillingPage({
  params: { lang },
}: {
  params: {
    lang: Locale;
  };
}) {
  const dict = await getDictionary(lang);
  return (
    <DashboardShell
      title={dict.business.billing.billing}
      description={dict.business.billing.content}
      className="space-y-4"
    >
      <SubscriptionCard dict={dict.business.billing} />

      <UsageCard dict={dict.business.billing} />
    </DashboardShell>
  );
}

function generateSubscriptionMessage(
  dict: Record<string, string>,
  subscription: Subscription,
): string {
  const content = String(dict.subscriptionInfo);
  if (subscription.plan && subscription.endsAt) {
    return content
      .replace("{plan}", subscription.plan)
      .replace("{date}", subscription.endsAt.toLocaleDateString());
  }
  return "";
}

async function SubscriptionCard({ dict }: { dict: Record<string, string> }) {
  const subscription = (await trpc.auth.mySubscription.query()) as Subscription;
  const content = generateSubscriptionMessage(dict, subscription);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
      </CardHeader>
      <CardContent>
        {subscription ? (
          <p dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          <p>{dict.noSubscription}</p>
        )}
      </CardContent>
      <CardFooter>
        <SubscriptionForm hasSubscription={!!subscription} dict={dict} />
      </CardFooter>
    </Card>
  );
}

async function UsageCard({ dict }: { dict: Record<string, string> }) {
  const clusters = await trpc.k8s.getClusters.query();
  const total = clusters?.length ?? 0;
  const running = clusters ? clusters.filter((cluster) => cluster.status === "RUNNING").length : 0;
  const pending = clusters ? clusters.filter((cluster) => cluster.status === "PENDING").length : 0;
  const stopped = clusters ? clusters.filter((cluster) => cluster.status === "STOPPED").length : 0;
  const hasUsage = total > 0;
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>{dict.usage_title}</CardTitle>
      </CardHeader>
      <CardContent>
        {hasUsage ? (
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              <p className="text-sm text-muted-foreground">{dict.usage_total}</p>
              <p className="text-2xl font-semibold">{total}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-sm text-muted-foreground">{dict.usage_running}</p>
              <p className="text-2xl font-semibold">{running}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-sm text-muted-foreground">{dict.usage_pending}</p>
              <p className="text-2xl font-semibold">{pending}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-sm text-muted-foreground">{dict.usage_stopped}</p>
              <p className="text-2xl font-semibold">{stopped}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{dict.usage_none}</p>
        )}
      </CardContent>
    </Card>
  );
}
